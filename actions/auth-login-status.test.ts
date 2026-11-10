import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security Finding 2: login reads the account status through
// my_account_status() — a deactivated user can no longer read their own
// profile row, so the old profiles query would have returned nothing.
const s = vi.hoisted(() => ({
  status: null as Record<string, unknown> | null,
  rpcError: false,
  signOuts: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@example.com' } } }),
      signOut: async () => { s.signOuts++ },
    },
    rpc: async () => (s.rpcError ? { data: null, error: { message: 'x' } } : { data: s.status ? [s.status] : [], error: null }),
  }),
}))
vi.mock('@/lib/email-sync.server', () => ({ syncProfileEmail: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }), headers: async () => ({ get: () => null }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

import { loginAction } from '@/actions/auth'

function form(portal: string) {
  const f = new FormData()
  f.set('email', 'a@example.com'); f.set('password', 'pw'); f.set('portal', portal)
  return f
}
const st = (role: string, is_active: boolean, deactivation_reason: string | null = null) =>
  ({ role, is_active, deactivation_reason, must_change_password: false })

beforeEach(() => { s.status = null; s.rpcError = false; s.signOuts = 0 })

describe('loginAction: account status', () => {
  it('deactivated → refused and signed out', async () => {
    s.status = st('champion', false, 'manual')
    expect((await loginAction(null, form('champion')))?.error).toMatch(/deactivated/)
    expect(s.signOuts).toBe(1)
  })
  it('club deactivated → club message', async () => {
    s.status = st('champion', false, 'club_deactivated')
    expect((await loginAction(null, form('champion')))?.error).toMatch(/club is currently inactive/)
  })
  it('no profile → refused', async () => {
    expect((await loginAction(null, form('super_admin')))?.error).toMatch(/deactivated/)
    expect(s.signOuts).toBe(1)
  })
  it('status unavailable → refused (fails closed), signed out', async () => {
    s.rpcError = true
    expect((await loginAction(null, form('champion')))?.error).toMatch(/try again/)
    expect(s.signOuts).toBe(1)
  })
  it('active Champion → into the Champion portal', async () => {
    s.status = st('champion', true)
    await expect(loginAction(null, form('champion'))).rejects.toThrow('redirect:/champion')
    expect(s.signOuts).toBe(0)
  })
})
