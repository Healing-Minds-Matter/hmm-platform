import 'server-only'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { LOGIN_THROTTLE, RESET_THROTTLE } from '@/lib/auth/throttle-config'

// Review Finding 10: per-account and per-IP limits on password attempts and
// password-reset requests. Web sign-ins all reach Supabase from the server's
// own address, so Supabase's per-IP limit can't protect a single account.
//
// Counters live in the database (auth_throttle, reached only through
// SECURITY DEFINER functions the service role may call). Keys are HMACs of
// the normalised email or the IP, so neither is stored. Checked before
// Supabase is called: a blocked attempt never reaches the password check.

export const LOGIN_FAILED_MESSAGE = 'Email or password is incorrect.'
export const RESET_SENT_MESSAGE = 'If an account exists, we’ve sent a link.'
export const THROTTLE_UNAVAILABLE_MESSAGE = 'We couldn’t sign you in right now. Please try again in a few minutes.'

export function normaliseEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase()
}

/** "Too many attempts. Try again in 15 minutes." with the real time left. */
export function tooManyAttemptsMessage(blockedUntil: Date, now: Date = new Date()): string {
  return `Too many attempts. Try again in ${describeWait(blockedUntil.getTime() - now.getTime())}.`
}

export function describeWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${plural(hours, 'hour')} and ${plural(rest, 'minute')}` : plural(hours, 'hour')
}

/**
 * The caller's IP, only from the hosting platform's own header. On Vercel,
 * x-real-ip / x-forwarded-for are set by Vercel's edge (a value sent by the
 * browser is overwritten). Anywhere else there's no trusted source, so no
 * IP is used and only the per-account limit applies.
 */
export async function trustedClientIp(): Promise<string | null> {
  if (process.env.VERCEL !== '1') return null
  const h = await headers()
  const candidate = h.get('x-real-ip')?.trim() || h.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
  return isIP(candidate) ? candidate : null
}

function hmac(value: string): string {
  // The service-role key is a server-only secret; using it as the HMAC key
  // means a leaked counter table can't be reversed with an email list.
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').update(value).digest('hex')
}

type Scope = 'account' | 'ip'
const key = (what: 'login' | 'reset', scope: Scope, value: string) => `${what}:${scope}:${hmac(value)}`

/** For logs and the audit trail: a@example.com → a***@example.com. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

type Subject = { email: string; ip: string | null }
function subjectKeys(what: 'login' | 'reset', s: Subject): { scope: Scope; key: string }[] {
  const keys: { scope: Scope; key: string }[] = [{ scope: 'account', key: key(what, 'account', normaliseEmail(s.email)) }]
  if (s.ip) keys.push({ scope: 'ip', key: key(what, 'ip', s.ip) })
  return keys
}

export type LoginGate = { ok: true } | { ok: false; blockedUntil: Date } | { ok: false; unavailable: true }

/** Before the password is checked: is this account or IP blocked? */
export async function checkLoginAllowed(s: Subject): Promise<LoginGate> {
  const { data, error } = await createAdminClient().rpc('auth_throttle_blocked_until', {
    p_keys: subjectKeys('login', s).map(k => k.key),
  })
  if (error) {
    console.error('[throttle] check failed:', error.code)
    return { ok: false, unavailable: true }
  }
  return data ? { ok: false, blockedUntil: new Date(data as string) } : { ok: true }
}

/** After a wrong password (or unknown email). Returns the block if this attempt started one. */
export async function recordLoginFailure(s: Subject & { portal: string }): Promise<Date | null> {
  const admin = createAdminClient()
  let blockedUntil: Date | null = null
  for (const { scope, key: k } of subjectKeys('login', s)) {
    const { data, error } = await admin.rpc('auth_throttle_record_failure', {
      p_key: k,
      p_max: scope === 'account' ? LOGIN_THROTTLE.accountMaxFailures : LOGIN_THROTTLE.ipMaxFailures,
      p_window_seconds: LOGIN_THROTTLE.windowSeconds,
      p_base_block_seconds: LOGIN_THROTTLE.baseBlockSeconds,
      p_max_block_seconds: LOGIN_THROTTLE.maxBlockSeconds,
      p_lockout_memory_seconds: LOGIN_THROTTLE.lockoutMemorySeconds,
    })
    if (error) {
      console.error('[throttle] record failed:', error.code)
      continue
    }
    const row = (Array.isArray(data) ? data[0] : data) as { locked: boolean; blocked_until: string; lockouts: number } | undefined
    if (!row?.locked) continue
    const until = new Date(row.blocked_until)
    if (!blockedUntil || until > blockedUntil) blockedUntil = until
    await recordLockout(scope, s, until, row.lockouts)
  }
  return blockedUntil
}

async function recordLockout(scope: Scope, s: Subject & { portal: string }, until: Date, lockouts: number) {
  // Never the password or the full email; the IP only as a short hash.
  const subject = scope === 'account' ? maskEmail(normaliseEmail(s.email)) : `ip#${hmac(s.ip ?? '').slice(0, 12)}`
  const details = { scope, subject, portal: s.portal, lockouts, blocked_until: until.toISOString() }
  console.warn('[throttle] sign-in lockout', details)
  try {
    await writeAuditLog({ action: 'auth.sign_in_locked', entityType: 'auth', details })
  } catch {
    console.error('[throttle] audit entry failed')
  }
}

/** A correct password: the account starts again from zero (the IP counter is kept). */
export async function clearLoginFailures(email: string): Promise<void> {
  const { error } = await createAdminClient().rpc('auth_throttle_clear', { p_key: key('login', 'account', normaliseEmail(email)) })
  if (error) console.error('[throttle] clear failed:', error.code)
}

/** Counts one reset request; false when the account or IP is over its limit (or the check failed). */
export async function allowResetRequest(s: Subject): Promise<boolean> {
  const admin = createAdminClient()
  let allowed = true
  for (const { scope, key: k } of subjectKeys('reset', s)) {
    const { data, error } = await admin.rpc('auth_throttle_hit', {
      p_key: k,
      p_max: scope === 'account' ? RESET_THROTTLE.accountMaxRequests : RESET_THROTTLE.ipMaxRequests,
      p_window_seconds: RESET_THROTTLE.windowSeconds,
    })
    if (error) {
      console.error('[throttle] reset check failed:', error.code)
      return false
    }
    if (data !== true) {
      allowed = false
      console.warn('[throttle] reset requests limited', { scope })
    }
  }
  return allowed
}
