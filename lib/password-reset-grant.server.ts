import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// /reset-password sets a new password WITHOUT asking for the current one, so
// it must only work for a session that really came from a reset-email link —
// not for any browser that happens to be signed in (e.g. an unattended
// Super Admin laptop). /auth/callback issues this grant cookie only after it
// has successfully exchanged a reset link's code for a session; the page and
// resetPasswordAction both require it.
//
// The cookie is an HMAC over the Supabase session id + issue time, so it
// can't be forged from devtools and can't be carried over to a different
// session (a normal sign-in gets a new session id, which won't match).
export const RESET_GRANT_COOKIE = 'hmm_pw_reset_grant'

// Which portal's Forgot Password page requested the link — only used to
// send an expired/used link back to the right Forgot Password page, so it
// isn't security-sensitive and doesn't need signing.
export const RESET_PORTAL_COOKIE = 'hmm_pw_reset_portal'

// How long a session that came from a reset link may set a new password
// (the link itself expires after 15 minutes — Supabase otp_expiry 900).
export const RESET_GRANT_MAX_AGE_SECONDS = 30 * 60

function sign(payload: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  return createHmac('sha256', key).update(`pw-reset-grant:${payload}`).digest('base64url')
}

export function createResetGrant(sessionId: string): string {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${sessionId}.${issuedAt}`
  return `${payload}.${sign(payload)}`
}

// True only if the current request's signed-in session is the one the grant
// was issued to, and the grant is still within its 30-minute window.
export async function hasResetGrant(): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sessionId = data?.claims?.session_id as string | undefined
  const grant = (await cookies()).get(RESET_GRANT_COOKIE)?.value
  return isValidResetGrant(grant, sessionId)
}

function isValidResetGrant(grant: string | undefined, sessionId: string | undefined): boolean {
  if (!grant || !sessionId) return false
  const parts = grant.split('.')
  if (parts.length !== 3) return false
  const [grantSessionId, issuedAtRaw, signature] = parts

  const expected = Buffer.from(sign(`${grantSessionId}.${issuedAtRaw}`))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false

  if (grantSessionId !== sessionId) return false

  const issuedAt = Number(issuedAtRaw)
  if (!Number.isFinite(issuedAt)) return false
  return Math.floor(Date.now() / 1000) - issuedAt <= RESET_GRANT_MAX_AGE_SECONDS
}
