import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Review Finding 10: per-account and per-IP limits on web sign-in attempts and
// password-reset requests. The database functions are stood in for by an
// in-memory copy of their rules (supabase/migrations/20261116000000_…); the
// real SQL is checked against a local Supabase by
// supabase/tests/review-f10-auth-throttle-rls.mjs.

type Row = { count: number; windowStart: number; blockedUntil: number | null; lockouts: number }
const s = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  passwords: new Map<string, string>(), // existing accounts
  signIns: [] as string[],
  resetEmails: [] as string[],
  audit: [] as Record<string, unknown>[],
  ip: '203.0.113.7' as string | null,
  spoofedForwardedFor: null as string | null,
  rpcFails: false,
  signInOutage: null as { status?: number; code?: string } | null,
}))

function fakeRpc(fn: string, a: Record<string, unknown>) {
  if (s.rpcFails) return { data: null, error: { code: 'XX000', message: 'down' } }
  const now = Date.now()
  if (fn === 'auth_throttle_blocked_until') {
    const until = (a.p_keys as string[]).map(k => s.rows.get(k)?.blockedUntil ?? 0).filter(t => t > now)
    return { data: until.length ? new Date(Math.max(...until)).toISOString() : null, error: null }
  }
  if (fn === 'auth_throttle_clear') { s.rows.delete(a.p_key as string); return { data: null, error: null } }
  const key = a.p_key as string
  const win = (a.p_window_seconds as number) * 1000
  const r = s.rows.get(key) ?? { count: 0, windowStart: now, blockedUntil: null, lockouts: 0 }
  s.rows.set(key, r)
  if (fn === 'auth_throttle_hit') {
    if (r.windowStart + win <= now) { r.count = 0; r.windowStart = now }
    if (r.count >= (a.p_max as number)) return { data: false, error: null }
    r.count++
    return { data: true, error: null }
  }
  // auth_throttle_record_failure
  if (r.blockedUntil && r.blockedUntil > now) return { data: [{ locked: false, blocked_until: new Date(r.blockedUntil).toISOString(), lockouts: r.lockouts }], error: null }
  if (r.blockedUntil && r.blockedUntil + (a.p_lockout_memory_seconds as number) * 1000 < now) r.lockouts = 0
  if (r.windowStart + win <= now) { r.count = 0; r.windowStart = now }
  r.count++
  let locked = false
  if (r.count >= (a.p_max as number)) {
    r.lockouts++
    const secs = Math.min((a.p_base_block_seconds as number) * 2 ** (r.lockouts - 1), a.p_max_block_seconds as number)
    r.blockedUntil = now + secs * 1000
    r.count = 0
    r.windowStart = now
    locked = true
  }
  return { data: [{ locked, blocked_until: r.blockedUntil ? new Date(r.blockedUntil).toISOString() : null, lockouts: r.lockouts }], error: null }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, a: Record<string, unknown>) => fakeRpc(fn, a),
    from: () => ({
      select: () => ({
        ilike: (_c: string, email: string) => ({
          limit: async () => ({ data: s.passwords.has(email.replace(/\\/g, '')) ? [{ role: 'super_admin' }] : [], error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        s.signIns.push(email)
        if (s.signInOutage) return { error: { message: '{}', ...s.signInOutage } }
        // Supabase answers an unknown email and a wrong password the same way.
        return s.passwords.get(email) === password ? { error: null } : { error: { message: 'Invalid login credentials', status: 400 } }
      },
      resetPasswordForEmail: async (email: string) => { s.resetEmails.push(email); return { error: null } },
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@example.com' } } }),
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: [{ role: 'super_admin', is_active: true, deactivation_reason: null, must_change_password: false }], error: null }),
  }),
}))
vi.mock('@/lib/email-sync.server', () => ({ syncProfileEmail: vi.fn() }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async (e: Record<string, unknown>) => { s.audit.push(e) }) }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => ({
    get: (name: string) => (name === 'x-real-ip' ? s.ip : name === 'x-forwarded-for' ? s.spoofedForwardedFor ?? s.ip : null),
  }),
}))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

import { forgotPasswordAction, loginAction } from '@/actions/auth'

const KNOWN = 'champion@example.com'
const RIGHT = 'Correct-Horse-9!'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const login = (email: string, password = 'wrong-password', portal = 'super_admin') =>
  loginAction(null, form({ email, password, portal })).then(r => r?.error, (e: Error) => e.message)
const requestReset = (email: string) => forgotPasswordAction(null, form({ email, portal: 'super_admin' }))

beforeEach(() => {
  s.rows.clear(); s.signIns = []; s.resetEmails = []; s.audit = []
  s.passwords = new Map([[KNOWN, RIGHT]])
  s.ip = '203.0.113.7'; s.spoofedForwardedFor = null; s.rpcFails = false; s.signInOutage = null
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-secret')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T04:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('Review Finding 10: sign-in attempts per account', () => {
  it('5 wrong passwords → blocked for 15 minutes; the 6th never reaches the password check', async () => {
    for (let i = 0; i < 4; i++) expect(await login(KNOWN)).toBe('Email or password is incorrect.')
    expect(await login(KNOWN)).toBe('Too many attempts. Try again in 15 minutes.')
    expect(s.signIns).toHaveLength(5)
    expect(await login(KNOWN, RIGHT)).toBe('Too many attempts. Try again in 15 minutes.')
    expect(s.signIns).toHaveLength(5)
  })

  it('shows the real time left', async () => {
    for (let i = 0; i < 5; i++) await login(KNOWN)
    vi.advanceTimersByTime(11 * 60_000 + 10_000)
    expect(await login(KNOWN)).toBe('Too many attempts. Try again in 4 minutes.')
  })

  it('the block expires, then the correct password works', async () => {
    for (let i = 0; i < 5; i++) await login(KNOWN)
    vi.advanceTimersByTime(15 * 60_000 + 1000)
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
  })

  it('a repeat lockout doubles the block (30 minutes), capped at 24 hours', async () => {
    for (let i = 0; i < 5; i++) await login(KNOWN)
    vi.advanceTimersByTime(15 * 60_000 + 1000)
    for (let i = 0; i < 4; i++) await login(KNOWN)
    expect(await login(KNOWN)).toBe('Too many attempts. Try again in 30 minutes.')
    // 24 hours after that block ended without another lockout, the doubling starts again.
    vi.advanceTimersByTime(30 * 60_000 + 24 * 3600_000 + 1000)
    for (let i = 0; i < 4; i++) await login(KNOWN)
    expect(await login(KNOWN)).toBe('Too many attempts. Try again in 15 minutes.')
  })

  it('never blocks for longer than 24 hours', async () => {
    const blocks: string[] = []
    for (let round = 0; round < 8; round++) {
      let last: string | undefined
      for (let i = 0; i < 5; i++) last = await login(KNOWN)
      blocks.push(last!.replace('Too many attempts. Try again in ', ''))
      const until = Math.max(...[...s.rows.values()].map(r => r.blockedUntil ?? 0))
      vi.setSystemTime(until + 1000) // just after the block ends
    }
    expect(blocks).toEqual([
      '15 minutes.', '30 minutes.', '1 hour.', '2 hours.', '4 hours.', '8 hours.', '16 hours.', '24 hours.',
    ])
  })

  it('a successful sign-in resets the account counter', async () => {
    for (let i = 0; i < 4; i++) await login(KNOWN)
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
    for (let i = 0; i < 4; i++) expect(await login(KNOWN)).toBe('Email or password is incorrect.')
  })

  it('an email that has no account behaves exactly like one that does', async () => {
    const known: (string | undefined)[] = []
    const unknown: (string | undefined)[] = []
    for (let i = 0; i < 6; i++) known.push(await login(KNOWN))
    s.ip = '198.51.100.9' // separate IP, so only the account counter is in play
    for (let i = 0; i < 6; i++) unknown.push(await login('nobody@example.com'))
    expect(unknown).toEqual(known)
  })

  it('the email is matched however it is typed (case, spaces)', async () => {
    for (let i = 0; i < 5; i++) await login(i % 2 ? '  Champion@Example.COM ' : KNOWN)
    expect(await login(KNOWN, RIGHT)).toMatch(/^Too many attempts/)
  })

  it('a lockout is recorded in the audit log with a masked email and no password', async () => {
    for (let i = 0; i < 5; i++) await login(KNOWN)
    expect(s.audit).toHaveLength(1)
    const entry = s.audit[0] as { action: string; actorId?: string; details: Record<string, unknown> }
    expect(entry.action).toBe('auth.sign_in_locked')
    expect(entry.details).toMatchObject({ scope: 'account', subject: 'c***@example.com', portal: 'super_admin', lockouts: 1 })
    expect(JSON.stringify(entry)).not.toContain(KNOWN)
    expect(JSON.stringify(entry)).not.toContain('wrong-password')
  })

  it('no email or password is stored in the counters', async () => {
    await login(KNOWN)
    for (const k of s.rows.keys()) {
      expect(k).not.toContain('champion')
      expect(k).not.toContain('203.0.113.7')
    }
  })

  it('if the limits can’t be checked, sign-in is refused without checking the password', async () => {
    s.rpcFails = true
    expect(await login(KNOWN, RIGHT)).toBe('We couldn’t sign you in right now. Please try again in a few minutes.')
    expect(s.signIns).toHaveLength(0)
  })

  it.each([
    ['busy (429)', { status: 429, code: 'over_request_rate_limit' }],
    ['server error (500)', { status: 500, code: 'unexpected_failure' }],
    ['unreachable (no status)', { status: 0 }],
  ])('Supabase %s: not counted as a wrong password, so nobody is locked out', async (_label, outage) => {
    s.signInOutage = outage
    for (let i = 0; i < 6; i++) {
      expect(await login(KNOWN, RIGHT)).toBe('We couldn’t sign you in right now. Please try again in a few minutes.')
    }
    expect(s.rows.size).toBe(0)
    expect(s.audit).toHaveLength(0)
    s.signInOutage = null
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
  })

  it('any other sign-in error still counts towards the limit', async () => {
    s.signInOutage = { status: 400, code: 'email_not_confirmed' }
    for (let i = 0; i < 4; i++) expect(await login(KNOWN)).toBe('Email or password is incorrect.')
    expect(await login(KNOWN)).toMatch(/^Too many attempts/)
  })
})

describe('Review Finding 10: sign-in attempts per IP', () => {
  it('20 wrong passwords across different accounts from one IP → that IP is blocked', async () => {
    for (let i = 0; i < 19; i++) expect(await login(`user${i}@example.com`)).toBe('Email or password is incorrect.')
    expect(await login('user19@example.com')).toBe('Too many attempts. Try again in 15 minutes.')
    expect(await login(KNOWN, RIGHT)).toMatch(/^Too many attempts/)
    expect(s.audit.some(e => (e.details as { scope: string }).scope === 'ip')).toBe(true)
  })

  it('another IP is not affected', async () => {
    for (let i = 0; i < 20; i++) await login(`user${i}@example.com`)
    s.ip = '198.51.100.9'
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
  })

  it('a correct password doesn’t clear the IP counter', async () => {
    for (let i = 0; i < 19; i++) await login(`user${i}@example.com`)
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
    expect(await login('user99@example.com')).toMatch(/^Too many attempts/)
  })

  it('off Vercel, forwarded-for headers are not trusted (no IP limit; the account limit still applies)', async () => {
    vi.stubEnv('VERCEL', '')
    for (let i = 0; i < 25; i++) {
      s.spoofedForwardedFor = `10.0.0.${i}`
      await login(`user${i}@example.com`)
    }
    expect(await login(KNOWN, RIGHT)).toBe('redirect:/super-admin')
    expect([...s.rows.keys()].some(k => k.includes(':ip:'))).toBe(false)
  })
})

describe('Review Finding 10: password-reset requests', () => {
  it('at most 3 per account an hour; the 4th sends nothing but gives the same answer', async () => {
    for (let i = 0; i < 3; i++) expect(await requestReset(KNOWN)).toEqual({ sent: true })
    expect(s.resetEmails).toHaveLength(3)
    expect(await requestReset(KNOWN)).toEqual({ sent: true })
    expect(s.resetEmails).toHaveLength(3)
    vi.advanceTimersByTime(3600_000 + 1000)
    await requestReset(KNOWN)
    expect(s.resetEmails).toHaveLength(4)
  })

  it('an unknown email gets the same answer and is counted the same way', async () => {
    for (let i = 0; i < 4; i++) expect(await requestReset('nobody@example.com')).toEqual({ sent: true })
    expect(s.resetEmails).toHaveLength(0)
  })

  it('at most 10 per IP an hour across accounts', async () => {
    for (let i = 0; i < 10; i++) await requestReset(`user${i}@example.com`)
    s.passwords.set('fresh@example.com', 'x')
    expect(await requestReset('fresh@example.com')).toEqual({ sent: true })
    expect(s.resetEmails).toHaveLength(0)
  })
})
