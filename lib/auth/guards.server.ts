import 'server-only'
import { createClient } from '@/lib/supabase/server'

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

export type GuardFailureReason = 'unauthenticated' | 'inactive' | 'forbidden' | 'out_of_scope'
export type GuardFailure = { ok: false; reason: GuardFailureReason; message: string }
export type GuardResult = { ok: true; caller: Caller } | GuardFailure

export const GUARD_MESSAGES: Record<GuardFailureReason, string> = {
  unauthenticated: 'Please sign in again.',
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  forbidden: 'You don’t have permission to do this.',
  out_of_scope: 'You can only do this for your own club.',
}

function fail(reason: GuardFailureReason, message = GUARD_MESSAGES[reason]): GuardFailure {
  return { ok: false, reason, message }
}

/** Signed in, with a profile, and active. */
export async function requireUser(): Promise<GuardResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  // No profile row means no role: treat it like a deactivated account.
  if (!profile || profile.is_active !== true) return fail('inactive')

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
