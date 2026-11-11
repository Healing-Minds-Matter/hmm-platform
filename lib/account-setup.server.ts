import 'server-only'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { sendAccountSetupEmail } from '@/lib/send-email'
import { validatePassword } from '@/lib/password-validation'
import { seedPasswordHistoryAdmin } from '@/lib/password-history.server'
import type { FieldErrors } from '@/lib/form-errors'

// Review Finding 2: set-password links. An account that has never been
// signed into gets a single-use link, emailed to the account's own sign-in
// address, to choose its first password. Nobody else ever sees, chooses or
// receives a password. Only the SHA-256 hash of the link's token is stored
// (account_setup_invites); the database refuses links for accounts that have
// already been signed into, and refuses requesters who aren't allowed.
//
// Only call these after the caller's role and scope have been checked (they
// use the service-role key).

export const ACCOUNT_SETUP_TTL_HOURS = 72
export const ACCOUNT_SETUP_PATH = '/auth/set-up-account'

export function hashSetupToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Has this account ever been signed into? Throws if it can't be checked, so
 * callers fail closed (treat "unknown" as "signed in").
 */
export async function hasSignedIn(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('account_has_signed_in', { p_user_id: userId })
  if (error || typeof data !== 'boolean') throw new Error('Could not check whether the account has signed in.')
  return data
}

/** Ends every session of this account (best effort; the result says whether it worked). */
export async function revokeUserSessions(userId: string): Promise<boolean> {
  const { error } = await createAdminClient().rpc('revoke_user_sessions', { p_user_id: userId })
  if (error) console.error('[revokeUserSessions] failed:', error.code ?? 'unknown')
  return !error
}

/** Cancels every set-password link of this account that hasn't been used yet. */
export async function cancelAccountSetupInvites(userId: string): Promise<void> {
  await createAdminClient().from('account_setup_invites')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('user_id', userId).is('used_at', null).is('cancelled_at', null)
}

const NOT_ALLOWED = 'This account has already been signed into, so there’s no invite to resend. If they’ve forgotten their password, they can reset it from the sign-in screen.'

/**
 * Emails a new set-password link to the account's current sign-in address.
 * Earlier unused links stop working, and so does any temporary password the
 * account was given (it's replaced by a random one nobody sees), so the link
 * is the only way in.
 */
export async function issueAccountSetupInvite(params: {
  userId: string
  requestedBy: string
  siteUrl?: string
}): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('full_name, role').eq('id', params.userId).maybeSingle()
  const { data: authUser } = await admin.auth.admin.getUserById(params.userId)
  const email = authUser?.user?.email
  if (!profile || !email) return { error: 'Account not found.' }

  await cancelAccountSetupInvites(params.userId)

  const token = crypto.randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ACCOUNT_SETUP_TTL_HOURS * 3600_000)
  const { data: invite, error: insertError } = await admin.from('account_setup_invites').insert({
    user_id: params.userId,
    token_hash: hashSetupToken(token),
    requested_by: params.requestedBy,
    expires_at: expiresAt.toISOString(),
  }).select('id').single()
  if (insertError || !invite) {
    // 42501: refused by the database rule (signed in since, or requester not allowed).
    return { error: insertError?.code === '42501' ? NOT_ALLOWED : 'Could not create the invite. Please try again.' }
  }

  // Retire any temporary password: a random one that is never stored or shown.
  const { error: pwError } = await admin.auth.admin.updateUserById(params.userId, {
    password: crypto.randomBytes(48).toString('base64url'),
  })
  if (pwError) {
    await admin.from('account_setup_invites').update({ cancelled_at: new Date().toISOString() }).eq('id', invite.id)
    return { error: 'Could not prepare the invite. Please try again.' }
  }

  const siteUrl = params.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const sent = await sendAccountSetupEmail({
    to: email,
    fullName: profile.full_name ?? '',
    setupUrl: `${siteUrl}${ACCOUNT_SETUP_PATH}?token=${encodeURIComponent(token)}`,
    expiresInHours: ACCOUNT_SETUP_TTL_HOURS,
    appLink: profile.role === 'gatekeeper' ? process.env.GATEKEEPER_ANDROID_DOWNLOAD_URL : undefined,
  })
  if (sent.error) {
    console.error('[issueAccountSetupInvite] email failed')
    await admin.from('account_setup_invites').update({ cancelled_at: new Date().toISOString() }).eq('id', invite.id)
    return { error: 'The invite email couldn’t be sent. Please try again.' }
  }

  await writeAuditLog({
    actorId: params.requestedBy,
    action: 'account.setup_link_sent',
    entityType: 'profile',
    entityId: params.userId,
    details: { expires_at: expiresAt.toISOString() },
  })
  return { ok: true }
}

type LiveInvite = { id: string; user_id: string; email: string; full_name: string; role: string }

async function findLiveInvite(token: string): Promise<LiveInvite | null> {
  if (!token || token.length > 200) return null
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('account_setup_invites')
    .select('id, user_id, expires_at, used_at, cancelled_at')
    .eq('token_hash', hashSetupToken(token))
    .maybeSingle()
  if (!invite || invite.used_at || invite.cancelled_at || new Date(invite.expires_at).getTime() <= Date.now()) return null
  const { data: profile } = await admin.from('profiles').select('full_name, email, role, is_active').eq('id', invite.user_id).maybeSingle()
  if (!profile?.is_active) return null
  return { id: invite.id, user_id: invite.user_id, email: profile.email, full_name: profile.full_name, role: profile.role }
}

/** For the set-password page: is the link usable, and whose account is it? Changes nothing. */
export async function peekAccountSetupInvite(token: string): Promise<{ email: string } | null> {
  const invite = await findLiveInvite(token)
  return invite ? { email: invite.email } : null
}

export type AccountSetupResult =
  | { done: true; role: string }
  | { invalid: true }
  | { error: string; fieldErrors?: FieldErrors }

/** Sets the account's first password from a set-password link (single use). */
export async function completeAccountSetup(token: string, password: string, confirm: string): Promise<AccountSetupResult> {
  const invite = await findLiveInvite(token)
  if (!invite) return { invalid: true }

  if (password !== confirm) return { error: 'Passwords do not match.', fieldErrors: { confirm: 'Passwords do not match.' } }
  const { valid, errors } = validatePassword(password, { name: invite.full_name, email: invite.email })
  if (!valid) return { error: errors.join('\n'), fieldErrors: { password: errors.join('\n') } }

  const admin = createAdminClient()
  // Claim it first so the link can only ever be used once. The database also
  // refuses this if the account has been signed into, or the link expired.
  const { data: claimed, error: claimError } = await admin
    .from('account_setup_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id).is('used_at', null).is('cancelled_at', null)
    .select('id')
  if (claimError || !claimed?.length) return { invalid: true }

  const { error: pwError } = await admin.auth.admin.updateUserById(invite.user_id, { password })
  if (pwError) {
    // Give the link back so the person can try again.
    await admin.from('account_setup_invites').update({ used_at: null }).eq('id', invite.id)
    return { error: 'Your password couldn’t be saved. Please try again.' }
  }
  await seedPasswordHistoryAdmin(invite.user_id, password)
  await admin.from('profiles').update({ must_change_password: false }).eq('id', invite.user_id)

  await writeAuditLog({
    actorId: invite.user_id,
    action: 'account.password_set_from_invite',
    entityType: 'profile',
    entityId: invite.user_id,
  })
  return { done: true, role: invite.role }
}
