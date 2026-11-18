import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fix 3: the Gatekeeper app's sign-in, forgot-password and password routes.
// Supabase and the throttle's database functions are stood in for by
// in-memory fakes (the throttle rules are the same as auth-throttle.test.ts).

type Row = { count: number; windowStart: number; blockedUntil: number | null; lockouts: number }
type Account = { id: string; email: string; password: string; role: string; is_active: boolean; deactivation_reason: string | null; full_name: string }

const s = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  accounts: [] as Account[],
  invites: [] as { user_id: string; used_at: string | null; cancelled_at: string | null }[],
  signedIn: new Set<string>(),
  signIns: [] as string[],
  sessions: new Map<string, string>(), // access token → user id
  signedOut: [] as { token?: string; scope: string }[],
  passwordUpdates: [] as { id: string; password: string }[],
  history: new Map<string, string[]>(),
  historyFails: false,
  pwned: new Set<string>(),
  audit: [] as Record<string, unknown>[],
  recoverCalls: [] as { url: string; body: Record<string, unknown> }[],
  signInOutage: null as { status?: number } | null,
  statusFails: false,
  ip: '203.0.113.7' as string | null,
  tokenSeq: 0,
}))

function fakeRpc(fn: string, a: Record<string, unknown>) {
  const now = Date.now()
  if (fn === 'auth_throttle_blocked_until') {
    const until = (a.p_keys as string[]).map(k => s.rows.get(k)?.blockedUntil ?? 0).filter(t => t > now)
    return { data: until.length ? new Date(Math.max(...until)).toISOString() : null, error: null }
  }
  if (fn === 'auth_throttle_clear') { s.rows.delete(a.p_key as string); return { data: null, error: null } }
  if (fn === 'account_has_signed_in') return { data: s.signedIn.has(a.p_user_id as string), error: null }
  const key = a.p_key as string
  const win = (a.p_window_seconds as number) * 1000
  const r = s.rows.get(key) ?? { count: 0, windowStart: now, blockedUntil: null, lockouts: 0 }
  s.rows.set(key, r)
  if (r.windowStart + win <= now) { r.count = 0; r.windowStart = now }
  if (fn === 'auth_throttle_hit') {
    if (r.count >= (a.p_max as number)) return { data: false, error: null }
    r.count++
    return { data: true, error: null }
  }
  // auth_throttle_record_failure
  if (r.blockedUntil && r.blockedUntil > now) return { data: [{ locked: false, blocked_until: new Date(r.blockedUntil).toISOString(), lockouts: r.lockouts }], error: null }
  r.count++
  let locked = false
  if (r.count >= (a.p_max as number)) {
    r.lockouts++
    r.blockedUntil = now + Math.min((a.p_base_block_seconds as number) * 2 ** (r.lockouts - 1), a.p_max_block_seconds as number) * 1000
    r.count = 0
    locked = true
  }
  return { data: [{ locked, blocked_until: r.blockedUntil ? new Date(r.blockedUntil).toISOString() : null, lockouts: r.lockouts }], error: null }
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function issueToken(userId: string, amr: { method: string; timestamp: number }[]) {
  const token = `${b64({ alg: 'ES256' })}.${b64({ sub: userId, amr, n: ++s.tokenSeq })}.sig`
  s.sessions.set(token, userId)
  return token
}
const byEmail = (email: string) => s.accounts.find(a => a.email === email)

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'x-real-ip' || name === 'x-forwarded-for' ? s.ip : null) }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async (e: Record<string, unknown>) => { s.audit.push(e) }) }))
vi.mock('@/lib/account-setup.server', () => ({ hasSignedIn: async (id: string) => s.signedIn.has(id) }))
vi.mock('@/lib/password-history.server', () => ({
  isPasswordReused: async (id: string, pw: string) => {
    if (s.historyFails) throw new Error('down')
    return (s.history.get(id) ?? []).slice(-5).includes(pw)
  },
  recordPasswordHash: async (id: string, pw: string) => { s.history.set(id, [...(s.history.get(id) ?? []), pw]) },
}))
vi.mock('@/lib/pwned-password.server', async orig => ({
  ...(await orig<typeof import('@/lib/pwned-password.server')>()),
  isPwnedPassword: async (pw: string) => s.pwned.has(pw),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, a: Record<string, unknown>) => fakeRpc(fn, a),
    from: (table: string) => ({
      select: () => ({
        ilike: (_c: string, pattern: string) => ({
          limit: async () => {
            const email = pattern.replace(/\\/g, '')
            return { data: s.accounts.filter(a => a.email === email).map(a => ({ id: a.id, role: a.role })), error: null }
          },
        }),
        eq: (_c: string, id: string) => {
          if (table === 'account_setup_invites') return Promise.resolve({ data: s.invites.filter(i => i.user_id === id), error: null })
          return { maybeSingle: async () => ({ data: s.accounts.find(a => a.id === id) ?? null, error: null }) }
        },
      }),
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, { password }: { password: string }) => {
          s.passwordUpdates.push({ id, password })
          const acc = s.accounts.find(a => a.id === id)!
          acc.password = password
          return { error: null }
        },
        signOut: async (token: string, scope: string) => { s.signedOut.push({ token, scope }); return { error: null } },
      },
    },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    let token = opts?.global?.headers?.Authorization?.replace('Bearer ', '')
    return {
      auth: {
        signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
          s.signIns.push(email)
          if (s.signInOutage) return { data: { session: null }, error: { message: '{}', ...s.signInOutage } }
          const acc = byEmail(email)
          if (!acc || acc.password !== password) return { data: { session: null }, error: { message: 'Invalid login credentials', status: 400 } }
          token = issueToken(acc.id, [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }])
          return { data: { session: { access_token: token, refresh_token: `refresh-${token}` } }, error: null }
        },
        signOut: async ({ scope }: { scope: string }) => { s.signedOut.push({ token, scope }); if (token) s.sessions.delete(token); return { error: null } },
        getUser: async (jwt: string) => {
          const id = s.sessions.get(jwt)
          const acc = s.accounts.find(a => a.id === id)
          return acc ? { data: { user: { id: acc.id, email: acc.email } }, error: null } : { data: { user: null }, error: { status: 401 } }
        },
      },
      rpc: async (fn: string) => {
        if (fn !== 'my_account_status') throw new Error(fn)
        if (s.statusFails) return { data: null, error: { code: 'XX000' } }
        const acc = s.accounts.find(a => a.id === s.sessions.get(token ?? ''))
        return { data: acc ? [{ role: acc.role, is_active: acc.is_active, deactivation_reason: acc.deactivation_reason, must_change_password: false }] : [], error: null }
      },
    }
  },
}))

import { isAllowedResetRedirect, isRecentRecoverySession, mobileForgotPassword, mobilePassword, mobileSignIn } from '@/lib/auth/mobile-auth.server'

const GK = 'gk@example.com'
const RIGHT = 'Kandy-Lake-River-42!'
const NEW = 'Galle-Fort-Lamp-73!'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://hmm.test/api/mobile/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
async function call(handler: (r: Request) => Promise<Response>, body: unknown, headers?: Record<string, string>) {
  const res = await handler(post(body, headers))
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}
const signIn = (email = GK, password = 'wrong-password') => call(mobileSignIn, { email, password })
const forgot = (email = GK, redirect_to = 'hmm://reset-password') => call(mobileForgotPassword, { email, code_challenge: CHALLENGE, redirect_to })
const changePassword = (token: string, current = RIGHT, next = NEW) =>
  call(mobilePassword, { mode: 'change', current_password: current, new_password: next }, { authorization: `Bearer ${token}` })
const resetPassword = (token: string, next = NEW) =>
  call(mobilePassword, { mode: 'reset', new_password: next }, { authorization: `Bearer ${token}` })
const recoveryToken = (minutesAgo = 1) => issueToken('gk1', [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) - minutesAgo * 60 }])
async function signedInToken() {
  const r = await signIn(GK, RIGHT)
  return (r.body.session as { access_token: string }).access_token
}

beforeEach(() => {
  s.rows.clear(); s.sessions.clear(); s.history.clear(); s.pwned.clear(); s.signedIn.clear()
  s.signIns = []; s.signedOut = []; s.passwordUpdates = []; s.audit = []; s.recoverCalls = []
  s.historyFails = false; s.signInOutage = null; s.statusFails = false; s.ip = '203.0.113.7'
  s.accounts = [
    { id: 'gk1', email: GK, password: RIGHT, role: 'gatekeeper', is_active: true, deactivation_reason: null, full_name: 'Asha Perera' },
    { id: 'ch1', email: 'champ@example.com', password: RIGHT, role: 'champion', is_active: true, deactivation_reason: null, full_name: 'Nimal Silva' },
    { id: 'gk2', email: 'later@example.com', password: 'x', role: 'gatekeeper', is_active: true, deactivation_reason: null, full_name: 'Send Later' },
  ]
  s.invites = [{ user_id: 'gk1', used_at: '2026-11-01T00:00:00Z', cancelled_at: null }]
  s.signedIn.add('gk1')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hmm.example.org')
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    s.recoverCalls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response('{}', { status: 200 })
  }))
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-18T04:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('POST /api/mobile/sign-in', () => {
  it('a Gatekeeper with the right password gets a session for the app', async () => {
    const r = await signIn(GK, RIGHT)
    expect(r.status).toBe(200)
    expect(r.body.session).toEqual({ access_token: expect.any(String), refresh_token: expect.any(String) })
  })

  it('a wrong password → the same message the web shows', async () => {
    expect(await signIn()).toEqual({ status: 401, body: { error: 'Email or password is incorrect.' } })
  })

  it('an unknown email behaves exactly like a wrong password', async () => {
    expect(await signIn('nobody@example.com')).toEqual({ status: 401, body: { error: 'Email or password is incorrect.' } })
  })

  it('5 wrong passwords → locked for 15 minutes; the next try never reaches Supabase', async () => {
    for (let i = 0; i < 4; i++) await signIn()
    expect(await signIn()).toEqual({ status: 429, body: { error: 'Too many attempts. Try again in 15 minutes.' } })
    const before = s.signIns.length
    expect((await signIn(GK, RIGHT)).body.error).toBe('Too many attempts. Try again in 15 minutes.')
    expect(s.signIns).toHaveLength(before)
  })

  it('shares the lockout with the web (same counter key)', async () => {
    for (let i = 0; i < 5; i++) await signIn()
    expect([...s.rows.keys()].some(k => k.startsWith('login:account:'))).toBe(true)
  })

  it('a repeat lockout doubles the block', async () => {
    for (let i = 0; i < 5; i++) await signIn()
    vi.advanceTimersByTime(15 * 60_000 + 1000)
    for (let i = 0; i < 4; i++) await signIn()
    expect((await signIn()).body.error).toBe('Too many attempts. Try again in 30 minutes.')
  })

  it('20 wrong passwords from one network across accounts → that network is blocked', async () => {
    for (let i = 0; i < 20; i++) await signIn(`user${i}@example.com`)
    expect((await signIn(GK, RIGHT)).status).toBe(429)
  })

  it('a Supabase outage is not counted as a wrong password', async () => {
    s.signInOutage = { status: 503 }
    for (let i = 0; i < 6; i++) expect((await signIn()).status).toBe(503)
    s.signInOutage = null
    expect((await signIn(GK, RIGHT)).status).toBe(200)
  })

  it('a correct password resets the account counter', async () => {
    for (let i = 0; i < 4; i++) await signIn()
    await signIn(GK, RIGHT)
    for (let i = 0; i < 4; i++) expect((await signIn()).status).toBe(401)
  })

  it('Gatekeepers only: a Champion is refused and the session just made is ended', async () => {
    const r = await signIn('champ@example.com', RIGHT)
    expect(r).toEqual({ status: 403, body: { error: 'This app is for Gatekeepers only. Please use the web portal for your account.' } })
    expect(s.signedOut.at(-1)?.scope).toBe('local')
    expect(s.sessions.size).toBe(0)
  })

  it('a deactivated Gatekeeper or inactive club is refused with the app’s message', async () => {
    s.accounts[0].is_active = false
    expect((await signIn(GK, RIGHT)).body.error).toBe('Your account has been deactivated. Please contact your Club Champion.')
    s.accounts[0].deactivation_reason = 'club_deactivated'
    expect((await signIn(GK, RIGHT)).body.error).toBe('Your club is currently inactive. Please contact your Club Champion.')
  })

  it('missing fields → asks for both', async () => {
    expect(await call(mobileSignIn, { email: '' })).toEqual({ status: 400, body: { error: 'Email and password are required.' } })
  })
})

describe('POST /api/mobile/forgot-password', () => {
  const SENT = { status: 200, body: { sent: true } }

  it('a Gatekeeper gets a reset email carrying the phone’s own PKCE challenge', async () => {
    expect(await forgot()).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(1)
    expect(s.recoverCalls[0].url).toBe('https://proj.supabase.co/auth/v1/recover?redirect_to=hmm%3A%2F%2Freset-password')
    expect(s.recoverCalls[0].body).toEqual({ email: GK, code_challenge: CHALLENGE, code_challenge_method: 's256' })
  })

  it('an unknown email: same reply, nothing sent', async () => {
    expect(await forgot('nobody@example.com')).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(0)
  })

  it('Gatekeepers only: a Champion gets the same reply, nothing sent', async () => {
    expect(await forgot('champ@example.com')).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(0)
  })

  it('"send later": no welcome email yet → same reply, nothing sent', async () => {
    expect(await forgot('later@example.com')).toEqual(SENT)
    s.invites.push({ user_id: 'gk2', used_at: null, cancelled_at: '2026-11-01T00:00:00Z' }) // a failed send
    expect(await forgot('later@example.com')).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(0)
    s.invites.push({ user_id: 'gk2', used_at: null, cancelled_at: null }) // welcome email sent
    await forgot('later@example.com')
    expect(s.recoverCalls).toHaveLength(1)
  })

  it('at most 3 per account an hour; the 4th sends nothing but gives the same reply', async () => {
    for (let i = 0; i < 3; i++) await forgot()
    expect(await forgot()).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(3)
    vi.advanceTimersByTime(3600_000 + 1000)
    await forgot()
    expect(s.recoverCalls).toHaveLength(4)
  })

  it('at most 10 per network an hour across accounts', async () => {
    for (let i = 0; i < 10; i++) await forgot(`user${i}@example.com`)
    expect(await forgot()).toEqual(SENT)
    expect(s.recoverCalls).toHaveLength(0)
  })

  it('a Supabase failure still gives the same reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await forgot()).toEqual(SENT)
  })

  it('only the app’s own reset link is accepted as the redirect', async () => {
    expect((await forgot(GK, 'https://evil.example/mobile/reset-password')).status).toBe(400)
    expect(isAllowedResetRedirect('https://hmm.example.org/mobile/reset-password')).toBe(true)
    expect(isAllowedResetRedirect('https://hmm.example.org/other')).toBe(false)
    expect(isAllowedResetRedirect('hmm://reset-password')).toBe(true)
    expect(isAllowedResetRedirect('javascript:alert(1)')).toBe(false)
    expect(isAllowedResetRedirect('http://hmm.example.org/mobile/reset-password')).toBe(false)
  })

  it('a bad email or challenge → 400', async () => {
    expect((await forgot('not-an-email')).body).toEqual({ error: 'Enter a valid email address.' })
    expect((await call(mobileForgotPassword, { email: GK, code_challenge: 'short', redirect_to: 'hmm://x' })).status).toBe(400)
  })
})

describe('POST /api/mobile/password — change', () => {
  it('verifies the current password, saves the new one to history, signs out other devices', async () => {
    const token = await signedInToken()
    expect(await changePassword(token)).toEqual({ status: 200, body: { ok: true } })
    expect(s.passwordUpdates).toEqual([{ id: 'gk1', password: NEW }])
    expect(s.history.get('gk1')).toEqual([NEW])
    expect(s.signedOut.at(-1)).toEqual({ token, scope: 'others' })
    expect(s.audit.at(-1)).toMatchObject({ action: 'auth.password_changed', entityId: 'gk1', details: { via: 'mobile' } })
  })

  it('a wrong current password → refused, and it counts towards the lockout', async () => {
    const token = await signedInToken()
    expect(await changePassword(token, 'wrong')).toEqual({ status: 400, body: { error: 'Current password is incorrect.' } })
    for (let i = 0; i < 3; i++) await changePassword(token, 'wrong')
    expect((await changePassword(token, 'wrong')).body.error).toBe('Too many attempts. Try again in 15 minutes.')
    expect(s.passwordUpdates).toHaveLength(0)
  })

  it('a correct current password starts the account counter again', async () => {
    const token = await signedInToken()
    for (let i = 0; i < 4; i++) await changePassword(token, 'wrong')
    expect((await changePassword(token)).status).toBe(200)
    for (let i = 0; i < 4; i++) expect((await signIn()).status).toBe(401)
  })

  it('one of the last 5 passwords → refused', async () => {
    s.history.set('gk1', [NEW])
    const token = await signedInToken()
    expect((await changePassword(token)).body.error).toBe('You cannot reuse one of your last 5 passwords. Please choose a different one.')
  })

  it('history can’t be read → refused (fails closed)', async () => {
    const token = await signedInToken()
    s.historyFails = true
    expect((await changePassword(token)).status).toBe(503)
    expect(s.passwordUpdates).toHaveLength(0)
  })

  it('a leaked password → refused', async () => {
    s.pwned.add(NEW)
    const token = await signedInToken()
    expect((await changePassword(token)).body.error).toBe('This password has appeared in a known data breach. Please choose a different one.')
  })

  it('a weak password or the same as the current one → refused', async () => {
    const token = await signedInToken()
    expect((await changePassword(token, RIGHT, 'short')).status).toBe(400)
    expect((await changePassword(token, RIGHT, RIGHT)).body.error).toBe('New password must be different from your current password.')
  })

  it('no or unknown token → session expired', async () => {
    expect((await call(mobilePassword, { mode: 'change', current_password: RIGHT, new_password: NEW })).status).toBe(401)
    expect((await changePassword('not-a-token')).status).toBe(401)
  })

  it('a non-Gatekeeper token is refused', async () => {
    const token = issueToken('ch1', [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }])
    expect((await changePassword(token)).status).toBe(403)
  })
})

describe('POST /api/mobile/password — reset', () => {
  it('from a reset-link session: saves the password, ends the lockout, signs out other devices', async () => {
    for (let i = 0; i < 5; i++) await signIn()
    const token = recoveryToken()
    expect(await resetPassword(token)).toEqual({ status: 200, body: { ok: true } })
    expect(s.history.get('gk1')).toEqual([NEW])
    expect(s.signedOut.at(-1)).toEqual({ token, scope: 'others' })
    expect(s.audit.at(-1)).toMatchObject({ action: 'auth.password_reset' })
    expect((await signIn(GK, NEW)).status).toBe(200)
  })

  it('an ordinary signed-in session can’t reset without the current password', async () => {
    const token = await signedInToken()
    expect(await resetPassword(token)).toEqual({ status: 403, body: { error: 'This reset link has expired or is no longer valid. Please request a new one.' } })
    expect(s.passwordUpdates).toHaveLength(0)
  })

  it('a reset-link session older than 30 minutes is refused', async () => {
    expect((await resetPassword(recoveryToken(31))).status).toBe(403)
    expect(isRecentRecoverySession(recoveryToken(29))).toBe(true)
  })

  it('history and leaked-password checks apply to a reset too', async () => {
    s.history.set('gk1', [NEW])
    expect((await resetPassword(recoveryToken())).body.error).toMatch(/last 5 passwords/)
    s.history.clear(); s.pwned.add(NEW)
    expect((await resetPassword(recoveryToken())).body.error).toMatch(/data breach/)
    expect(s.passwordUpdates).toHaveLength(0)
  })

  it('a failed reset clears no lockout', async () => {
    for (let i = 0; i < 5; i++) await signIn()
    s.pwned.add(NEW)
    await resetPassword(recoveryToken())
    expect((await signIn(GK, RIGHT)).status).toBe(429)
  })
})
