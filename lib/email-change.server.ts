import 'server-only'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { sendEmailChangeConfirmation, sendEmailChangeNotice } from '@/lib/send-email'

// Security Finding 3: a Super Admin or Champion changing SOMEONE ELSE's
// sign-in email. Nothing changes until the new address confirms a one-time
// link; the current address is told a change was requested.
//
// Only call these after the caller's role and scope have been checked (they
// use the service-role key). Only the SHA-256 hash of the token is stored.

export const EMAIL_CHANGE_TTL_HOURS = 24
export const EMAIL_CHANGE_CONFIRM_PATH = '/auth/confirm-account-email'

export function hashEmailChangeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Is this email already someone else's sign-in? */
async function emailTaken(admin: ReturnType<typeof createAdminClient>, email: string, excludeUserId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('id').eq('email', email).neq('id', excludeUserId).limit(1)
  return !!data?.length
}

/** For a form to check before saving anything. */
export async function isEmailAvailable(email: string, excludeUserId: string): Promise<boolean> {
  return !(await emailTaken(createAdminClient(), email.trim().toLowerCase(), excludeUserId))
}

export async function requestAccountEmailChange(params: {
  userId: string
  currentEmail: string
  newEmail: string
  fullName: string
  requestedBy: string
  siteUrl?: string
}): Promise<{ ok: true } | { error: string; field?: 'email' }> {
  const admin = createAdminClient()
  const newEmail = params.newEmail.trim().toLowerCase()
  if (await emailTaken(admin, newEmail, params.userId)) {
    return { error: 'That email is already used by another account.', field: 'email' }
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const now = new Date()

  // Only the latest request counts.
  await admin.from('email_change_requests')
    .update({ cancelled_at: now.toISOString() })
    .eq('user_id', params.userId).is('confirmed_at', null).is('cancelled_at', null)

  const { error } = await admin.from('email_change_requests').insert({
    user_id: params.userId,
    new_email: newEmail,
    token_hash: hashEmailChangeToken(token),
    requested_by: params.requestedBy,
    expires_at: new Date(now.getTime() + EMAIL_CHANGE_TTL_HOURS * 3600_000).toISOString(),
  })
  if (error) return { error: 'Could not start the email change. Please try again.' }

  const siteUrl = params.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const sent = await sendEmailChangeConfirmation({
    to: newEmail,
    fullName: params.fullName,
    confirmUrl: `${siteUrl}${EMAIL_CHANGE_CONFIRM_PATH}?token=${encodeURIComponent(token)}`,
    expiresInHours: EMAIL_CHANGE_TTL_HOURS,
  })
  if (sent.error) {
    console.error('[requestAccountEmailChange] confirmation email failed:', sent.error)
    return { error: 'The confirmation email couldn’t be sent, so the email was not changed. Please try again.' }
  }
  // Best effort: the change still needs the new address to confirm.
  const notice = await sendEmailChangeNotice({ to: params.currentEmail, fullName: params.fullName, newEmail })
  if (notice.error) console.error('[requestAccountEmailChange] notice to current address failed:', notice.error)

  await writeAuditLog({
    actorId: params.requestedBy,
    action: 'profile.email_change_requested',
    entityType: 'profile',
    entityId: params.userId,
    details: { from: params.currentEmail, to: newEmail },
  })
  return { ok: true }
}

export type ConfirmEmailChangeResult = 'done' | 'invalid' | 'taken' | 'error'

/** Applies a pending change if the token is valid, unused, unexpired and the latest one. */
export async function confirmAccountEmailChange(token: string): Promise<ConfirmEmailChangeResult> {
  if (!token || token.length > 200) return 'invalid'
  const admin = createAdminClient()
  const { data: req } = await admin
    .from('email_change_requests')
    .select('id, user_id, new_email, requested_by, expires_at, confirmed_at, cancelled_at')
    .eq('token_hash', hashEmailChangeToken(token))
    .maybeSingle()
  if (!req || req.confirmed_at || req.cancelled_at || new Date(req.expires_at).getTime() <= Date.now()) return 'invalid'

  // Claim it first so the link can only ever be used once.
  const { data: claimed } = await admin
    .from('email_change_requests')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', req.id).is('confirmed_at', null).is('cancelled_at', null)
    .select('id')
  if (!claimed?.length) return 'invalid'

  if (await emailTaken(admin, req.new_email, req.user_id)) return 'taken'

  const { data: profile } = await admin.from('profiles').select('email').eq('id', req.user_id).maybeSingle()
  const { error: authError } = await admin.auth.admin.updateUserById(req.user_id, { email: req.new_email, email_confirm: true })
  if (authError) {
    console.error('[confirmAccountEmailChange] auth update failed:', authError.message)
    return authError.message.toLowerCase().includes('already') ? 'taken' : 'error'
  }
  const { error: profileError } = await admin.from('profiles').update({ email: req.new_email }).eq('id', req.user_id)
  if (profileError) console.error('[confirmAccountEmailChange] profile update failed:', profileError.message)

  await writeAuditLog({
    actorId: req.requested_by ?? undefined,
    action: 'profile.email_changed',
    entityType: 'profile',
    entityId: req.user_id,
    details: { from: profile?.email ?? null, to: req.new_email, confirmed_by: 'new address link' },
  })
  return 'done'
}
