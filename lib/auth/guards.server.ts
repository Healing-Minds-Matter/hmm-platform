import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fetchAccountStatus } from '@/lib/auth/account-status'
import { currentAssuranceLevel, roleNeedsMfa } from '@/lib/auth/mfa'

// Shared server-side guards (security go-live plan, "two locks"). Every server
// action and route handler checks the caller here first; the database rules
// (RLS) are the second, independent check.
//
// Deliberately free of UI and Next.js navigation: each guard returns a result
// the caller turns into a redirect or an error message. That keeps them
// reusable when these checks move behind the planned API.

export type Role = 'super_admin' | 'champion' | 'gatekeeper'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** The signed-in, active caller. Identity, role and club come from the database, never from the request. */
export type Caller = {
  id: string
  role: Role
  clubId: string | null
  /** The caller's own Supabase client: RLS applies to everything done with it. */
  supabase: ServerClient
}

export type GuardFailureReason = 'unauthenticated' | 'inactive' | 'club_inactive' | 'mfa_required' | 'password_change_required' | 'forbidden' | 'out_of_scope'
export type GuardFailure = { ok: false; reason: GuardFailureReason; message: string }
export type GuardResult = { ok: true; caller: Caller } | GuardFailure

export const GUARD_MESSAGES: Record<GuardFailureReason, string> = {
  unauthenticated: 'Please sign in again.',
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  club_inactive: 'Your club is currently inactive. Please contact your administrator.',
  mfa_required: 'Please enter the code from your authenticator app to continue.',
  password_change_required: 'Please set a new password before continuing.',
  forbidden: 'You don’t have permission to do this.',
  out_of_scope: 'You can only do this for your own club.',
}

function fail(reason: GuardFailureReason, message = GUARD_MESSAGES[reason]): GuardFailure {
  return { ok: false, reason, message }
}

/** Signed in, with a profile, active, and not waiting to replace a temporary password (Review Finding 3). */
export async function requireUser(): Promise<GuardResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id, is_active, must_change_password')
    .eq('id', user.id)
    .maybeSingle()

  // No profile row means no role: treat it like a deactivated account.
  // (The database also hides the profile of a member of an inactive club —
  // Review Finding 6 — so ask my_account_status() which message applies.)
  if (!profile || profile.is_active !== true) {
    const status = await fetchAccountStatus(supabase).catch(() => ({ ok: false as const }))
    // Review Finding 8: the database also hides a Super Admin's profile until
    // their session has passed two-step verification.
    if (status.ok && status.status?.is_active && roleNeedsMfa(status.status.role)) return fail('mfa_required')
    return status.ok && status.status?.deactivation_reason === 'club_deactivated' ? fail('club_inactive') : fail('inactive')
  }
  if (roleNeedsMfa(profile.role) && (await currentAssuranceLevel(supabase)) !== 'aal2') return fail('mfa_required')
  // Until the temporary password is replaced, only the change-password
  // screen (which doesn't use these guards) is available.
  if (profile.must_change_password === true) return fail('password_change_required')

  return { ok: true, caller: { id: user.id, role: profile.role as Role, clubId: profile.club_id ?? null, supabase } }
}

/** Signed in, active, and holding one of `roles`. */
export async function requireRole(roles: readonly Role[], message?: string): Promise<GuardResult> {
  const result = await requireUser()
  if (!result.ok) return result
  if (!roles.includes(result.caller.role)) return fail('forbidden', message)
  return result
}

/**
 * Super Admins may act on any club; Champions and Gatekeepers only on their own.
 * Call after requireUser/requireRole, with a club id looked up on the server.
 */
export function requireClubScope(caller: Caller, clubId: string | null): { ok: true } | GuardFailure {
  if (caller.role === 'super_admin') return { ok: true }
  if (!clubId || !caller.clubId || caller.clubId !== clubId) return fail('out_of_scope')
  return { ok: true }
}
