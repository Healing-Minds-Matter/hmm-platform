import 'server-only'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { hasSignedIn } from '@/lib/account-setup.server'
import { validatePassword } from '@/lib/password-validation'
import { isPasswordReused, recordPasswordHash } from '@/lib/password-history.server'
import { PWNED_PASSWORD_MESSAGE, isPwnedPassword } from '@/lib/pwned-password.server'
import { RESET_GRANT_MAX_AGE_SECONDS } from '@/lib/password-reset-grant.server'
import {
  LOGIN_FAILED_MESSAGE,
  THROTTLE_UNAVAILABLE_MESSAGE,
  allowResetRequest,
  checkLoginAllowed,
  clearLoginFailures,
  isAuthOutage,
  normaliseEmail,
  recordLoginFailure,
  tooManyAttemptsMessage,
  trustedClientIp,
} from '@/lib/auth/throttle.server'
import type { AccountStatus } from '@/lib/auth/account-status'

// Fix 3: the Gatekeeper app signs in, asks for reset links and changes
// passwords through these server routes (app/api/mobile/*) instead of
// calling Supabase directly, so it gets the same protection as the web:
// per-account and per-network lockout, last-5 password history, the
// leaked-password check, and "send later" accounts getting no reset email.
// Each handler takes the request and returns a JSON Response; messages are
// fixed strings (never Supabase's own text), the same ones the web shows.

const REQUIRED = 'required'
const EMAIL = z.string({ error: REQUIRED }).transform(normaliseEmail)
  .pipe(z.string().min(1, REQUIRED).max(254).pipe(z.email()))
const PASSWORD = z.string({ error: REQUIRED }).min(1, REQUIRED).max(1024)

const SIGN_IN_INPUT = z.object({ email: EMAIL, password: PASSWORD })
const FORGOT_INPUT = z.object({
  email: EMAIL,
  // The app's own PKCE challenge: the link then only works on the phone that asked.
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  redirect_to: z.string().max(500),
})
const PASSWORD_INPUT = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('change'), current_password: PASSWORD, new_password: PASSWORD }),
  z.object({ mode: z.literal('reset'), new_password: PASSWORD }),
])

export const MOBILE_MESSAGES = {
  required: 'Email and password are required.',
  invalidEmail: 'Enter a valid email address.',
  badRequest: 'Something went wrong. Please try again.',
  signInFailed: 'Sign-in failed. Please check your connection and try again.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  resetExpired: 'This reset link has expired or is no longer valid. Please request a new one.',
  currentWrong: 'Current password is incorrect.',
  sameAsCurrent: 'New password must be different from your current password.',
  reused: 'You cannot reuse one of your last 5 passwords. Please choose a different one.',
  historyUnavailable: 'We couldn’t check your password history right now. Please try again in a moment.',
  updateFailed: 'Your password couldn’t be saved. Please try again.',
  // Same wording as the app's own account checks (hmm-mobile src/lib/account-status.ts).
  deactivated: 'Your account has been deactivated. Please contact your Club Champion.',
  clubInactive: 'Your club is currently inactive. Please contact your Club Champion.',
  notGatekeeper: 'This app is for Gatekeepers only. Please use the web portal for your account.',
  noAccount: 'Your account could not be found. Please contact your Club Champion.',
} as const

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (status: number, error: string) => json(status, { error })

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** A Supabase client with no stored session, for one sign-in or one user's token. */
function anonClient(accessToken?: string): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  })
}

async function readStatus(client: SupabaseClient): Promise<{ ok: true; status: AccountStatus | null } | { ok: false }> {
  const { data, error } = await client.rpc('my_account_status')
  if (error) return { ok: false }
  const row = (Array.isArray(data) ? data[0] : data) as AccountStatus | undefined
  return { ok: true, status: row ?? null }
}

/** Why this account may not use the app, or null when it may. */
function refusal(status: AccountStatus | null): string | null {
  if (!status) return MOBILE_MESSAGES.noAccount
  if (!status.is_active) return status.deactivation_reason === 'club_deactivated' ? MOBILE_MESSAGES.clubInactive : MOBILE_MESSAGES.deactivated
  if (status.role !== 'gatekeeper') return MOBILE_MESSAGES.notGatekeeper
  return null
}

// ---------------------------------------------------------------------------
// POST /api/mobile/sign-in  { email, password }
// ---------------------------------------------------------------------------
export async function mobileSignIn(request: Request): Promise<Response> {
  const parsed = SIGN_IN_INPUT.safeParse(await readJson(request))
  if (!parsed.success) {
    const missing = parsed.error.issues.some(i => i.message === REQUIRED)
    return fail(400, missing ? MOBILE_MESSAGES.required : LOGIN_FAILED_MESSAGE)
  }
  const { email, password } = parsed.data

  // Same limits as the web: checked before the password reaches Supabase.
  const subject = { email, ip: await trustedClientIp() }
  const gate = await checkLoginAllowed(subject)
  if (!gate.ok) {
    return 'unavailable' in gate ? fail(503, THROTTLE_UNAVAILABLE_MESSAGE) : fail(429, tooManyAttemptsMessage(gate.blockedUntil))
  }

  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    if (error && isAuthOutage(error)) {
      console.error('[mobile sign-in] sign-in service unavailable', { status: error.status ?? null, code: error.code ?? null })
      return fail(503, THROTTLE_UNAVAILABLE_MESSAGE)
    }
    const blockedUntil = await recordLoginFailure({ ...subject, portal: 'mobile' })
    return blockedUntil ? fail(429, tooManyAttemptsMessage(blockedUntil)) : fail(401, LOGIN_FAILED_MESSAGE)
  }
  await clearLoginFailures(email)

  const account = await readStatus(client)
  const refused = account.ok ? refusal(account.status) : MOBILE_MESSAGES.signInFailed
  if (refused || !account.ok) {
    // Ends the session just created, so its tokens are never usable.
    await client.auth.signOut({ scope: 'local' })
    return fail(account.ok ? 403 : 503, refused ?? MOBILE_MESSAGES.signInFailed)
  }

  const { access_token, refresh_token } = data.session
  return json(200, { session: { access_token, refresh_token }, must_change_password: account.status?.must_change_password === true })
}

// ---------------------------------------------------------------------------
// POST /api/mobile/forgot-password  { email, code_challenge, redirect_to }
// ---------------------------------------------------------------------------
const SENT = { sent: true }

/** Only the app's own reset link: a custom scheme, or this site's /mobile/reset-password page. */
export function isAllowedResetRedirect(value: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === 'https:') {
    // The app-link domain is this web site (it serves /.well-known and /mobile/reset-password).
    if (url.pathname !== '/mobile/reset-password' || !siteUrl) return false
    try {
      return url.host === new URL(siteUrl).host
    } catch {
      return false
    }
  }
  // hmm:// in store builds; exp:// in Expo Go during development.
  return ['hmm:', 'exp:', 'exps:'].includes(url.protocol)
}

/** Has this Gatekeeper ever been sent their welcome (set-password) email, or signed in? */
async function welcomeEmailSent(userId: string): Promise<boolean> {
  if (await hasSignedIn(userId)) return true
  const { data, error } = await createAdminClient()
    .from('account_setup_invites')
    .select('id, used_at, cancelled_at')
    .eq('user_id', userId)
  if (error) throw new Error('Could not check the welcome email.')
  // A cancelled-only history means every invite was replaced or failed to send.
  return (data ?? []).some(r => r.used_at || !r.cancelled_at)
}

export async function mobileForgotPassword(request: Request): Promise<Response> {
  const body = await readJson(request)
  const parsed = FORGOT_INPUT.safeParse(body)
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find(i => i.path[0] === 'email')
    if (emailIssue) return fail(400, emailIssue.message === REQUIRED ? 'Email is required.' : MOBILE_MESSAGES.invalidEmail)
    return fail(400, MOBILE_MESSAGES.badRequest)
  }
  const { email, code_challenge, redirect_to } = parsed.data
  if (!isAllowedResetRedirect(redirect_to)) return fail(400, MOBILE_MESSAGES.badRequest)

  // From here on the answer is always the same, so it never shows whether
  // (or as what) an account exists.
  if (!(await allowResetRequest({ email, ip: await trustedClientIp() }))) return json(200, SENT)

  try {
    const { data: matches } = await createAdminClient()
      .from('profiles')
      .select('id, role')
      .ilike('email', email.replace(/[\\%_]/g, c => `\\${c}`))
      .limit(2)
    const match = matches?.length === 1 ? matches[0] : null
    if (match?.role !== 'gatekeeper') return json(200, SENT)
    // "Send later": the creator hasn't sent the welcome email yet, so no reset email either.
    if (!(await welcomeEmailSent(match.id))) return json(200, SENT)
  } catch {
    console.error('[mobile forgot-password] account lookup failed')
    return json(200, SENT)
  }

  // Supabase's own reset request, with the phone's PKCE challenge.
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect_to)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ email, code_challenge, code_challenge_method: 's256' }),
      cache: 'no-store',
    })
    if (!res.ok) console.error('[mobile forgot-password] reset email not sent', { status: res.status })
  } catch {
    console.error('[mobile forgot-password] reset email not sent (Supabase unreachable)')
  }
  return json(200, SENT)
}

// ---------------------------------------------------------------------------
// POST /api/mobile/password  (Authorization: Bearer <access token>)
//   { mode: 'change', current_password, new_password }
//   { mode: 'reset', new_password }   — only from a reset-link session
// ---------------------------------------------------------------------------
type Amr = { method?: string; timestamp?: number }

/** The access token's sign-in methods (only read after Supabase has accepted the token). */
function tokenAmr(token: string): Amr[] {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return Array.isArray(payload.amr) ? payload.amr : []
  } catch {
    return []
  }
}

/** A session that came from a reset link in the last 30 minutes (same window as the web). */
export function isRecentRecoverySession(token: string, now = Date.now()): boolean {
  return tokenAmr(token).some(a =>
    a.method === 'recovery' && typeof a.timestamp === 'number' && now - a.timestamp * 1000 <= RESET_GRANT_MAX_AGE_SECONDS * 1000)
}

export async function mobilePassword(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return fail(401, MOBILE_MESSAGES.sessionExpired)

  const parsed = PASSWORD_INPUT.safeParse(await readJson(request))
  if (!parsed.success) return fail(400, MOBILE_MESSAGES.badRequest)
  const input = parsed.data

  const client = anonClient(token)
  const { data: userData, error: userError } = await client.auth.getUser(token)
  const user = userData?.user
  if (userError || !user?.email) return fail(401, MOBILE_MESSAGES.sessionExpired)

  const account = await readStatus(client)
  if (!account.ok) return fail(503, MOBILE_MESSAGES.signInFailed)
  const refused = refusal(account.status)
  if (refused) return fail(403, refused)

  if (input.mode === 'reset' && !isRecentRecoverySession(token)) return fail(403, MOBILE_MESSAGES.resetExpired)

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
  const newPassword = input.new_password
  const { valid, errors } = validatePassword(newPassword, { name: profile?.full_name, email: profile?.email ?? user.email })
  if (!valid) return fail(400, errors[0])

  if (input.mode === 'change') {
    if (newPassword === input.current_password) return fail(400, MOBILE_MESSAGES.sameAsCurrent)
    // The current password counts towards the same lockout as sign-in, so a
    // stolen session can't be used to guess it.
    const subject = { email: user.email, ip: await trustedClientIp() }
    const gate = await checkLoginAllowed(subject)
    if (!gate.ok) {
      return 'unavailable' in gate ? fail(503, THROTTLE_UNAVAILABLE_MESSAGE) : fail(429, tooManyAttemptsMessage(gate.blockedUntil))
    }
    const verifier = anonClient()
    const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: input.current_password })
    if (verifyError) {
      if (isAuthOutage(verifyError)) return fail(503, THROTTLE_UNAVAILABLE_MESSAGE)
      const blockedUntil = await recordLoginFailure({ ...subject, portal: 'mobile' })
      return blockedUntil ? fail(429, tooManyAttemptsMessage(blockedUntil)) : fail(400, MOBILE_MESSAGES.currentWrong)
    }
    await verifier.auth.signOut({ scope: 'local' })
    // A correct password starts the account counter again, as at sign-in.
    await clearLoginFailures(user.email)
  }

  // Last 5 passwords (fails closed), then the leaked-password check (fails open).
  let reused: boolean
  try {
    reused = await isPasswordReused(user.id, newPassword)
  } catch {
    return fail(503, MOBILE_MESSAGES.historyUnavailable)
  }
  if (reused) return fail(400, MOBILE_MESSAGES.reused)
  if (await isPwnedPassword(newPassword)) return fail(400, PWNED_PASSWORD_MESSAGE)

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword })
  if (updateError) {
    console.error('[mobile password] update failed', { status: updateError.status ?? null, code: updateError.code ?? null })
    return fail(500, MOBILE_MESSAGES.updateFailed)
  }

  await recordPasswordHash(user.id, newPassword)
  // A reset also ends any sign-in lockout on the account (HMM-195).
  if (input.mode === 'reset') await clearLoginFailures(user.email)
  await writeAuditLog({
    actorId: user.id,
    action: input.mode === 'reset' ? 'auth.password_reset' : 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    details: { via: 'mobile' },
  })

  // Every other device has to sign in again; this one stays signed in.
  const { error: signOutError } = await admin.auth.admin.signOut(token, 'others')
  if (signOutError) console.error('[mobile password] signing out other devices failed', { status: signOutError.status ?? null })

  return json(200, { ok: true })
}
