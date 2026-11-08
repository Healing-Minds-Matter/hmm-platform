import { beforeEach, describe, expect, it, vi } from 'vitest'

// Logout and the idle/maximum-age sign-out (sheet rows 5, 8 and 58): each
// signs the user out and lands them on their own portal's login page.
const s = vi.hoisted(() => ({
  role: 'champion' as string | null,
  signOutScopes: [] as (string | undefined)[],
  deleted: [] as string[],
  hint: undefined as string | undefined,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: s.role ? { id: 'u1' } : null } }),
      signOut: async (opts?: { scope?: string }) => { s.signOutScopes.push(opts?.scope) },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: s.role } }) }) }) }),
  }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'hmm_portal' && s.hint ? { value: s.hint } : undefined),
    set: vi.fn(),
    delete: (name: string) => { s.deleted.push(name) },
  }),
  headers: async () => ({ get: () => null }),
}))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('server-only', () => ({}))

import { logoutAction, sessionTimeoutLogoutAction } from '@/actions/auth'

beforeEach(() => { s.role = 'champion'; s.signOutScopes = []; s.deleted = []; s.hint = undefined })

describe('logout', () => {
  it('sends a Champion to the Champion login', async () => {
    await expect(logoutAction()).rejects.toThrow('redirect:/champion/login')
    expect(s.signOutScopes).toEqual(['global'])
    expect(s.deleted).toContain('hmm_last_active')
  })
  it('sends a Super Admin to the Super Admin login', async () => {
    s.role = 'super_admin'
    await expect(logoutAction()).rejects.toThrow('redirect:/login')
  })
  it('already signed out: uses the portal this browser last used', async () => {
    s.role = null
    s.hint = 'champion'
    await expect(logoutAction()).rejects.toThrow('redirect:/champion/login')
  })
})

describe('session expiry sign-out', () => {
  it('signs out this browser only and shows "session expired" on the own portal login', async () => {
    await expect(sessionTimeoutLogoutAction()).rejects.toThrow('redirect:/champion/login?error=session_expired')
    expect(s.signOutScopes).toEqual(['local'])
    s.role = 'super_admin'
    await expect(sessionTimeoutLogoutAction()).rejects.toThrow('redirect:/login?error=session_expired')
  })
})
