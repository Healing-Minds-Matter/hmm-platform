import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Security Finding 2: the web app checks account status on every request,
// not only at login.

type Status = { role: string; is_active: boolean; deactivation_reason: string | null; must_change_password: boolean }
const s = vi.hoisted(() => ({
  signedIn: true,
  status: null as Status | null,
  rpcError: false,
  fallbackProfile: null as Status | null,
  signOuts: 0,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: s.signedIn ? { id: 'u1' } : null } }),
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => { s.signOuts++ },
    },
    rpc: async (name: string) => {
      expect(name).toBe('my_account_status')
      return s.rpcError ? { data: null, error: { message: 'boom' } } : { data: s.status ? [s.status] : [], error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: s.fallbackProfile }) }) }) }),
  }),
}))

import { middleware } from '@/middleware'

const active = (role: string): Status => ({ role, is_active: true, deactivation_reason: null, must_change_password: false })
const inactive = (role: string, reason: string): Status => ({ role, is_active: false, deactivation_reason: reason, must_change_password: false })

function req(path: string, init?: { method?: string; headers?: Record<string, string> }) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), init)
}
const location = (res: Response) => res.headers.get('location')?.replace('http://localhost:3000', '') ?? null

beforeEach(() => { s.signedIn = true; s.status = null; s.rpcError = false; s.fallbackProfile = null; s.signOuts = 0 })

describe('middleware: account status on every request', () => {
  it('active Champion → page served', async () => {
    s.status = active('champion')
    const res = await middleware(req('/champion/gatekeepers'))
    expect(location(res)).toBeNull()
    expect(s.signOuts).toBe(0)
  })

  it('deactivated Champion mid-session → signed out, sent to their login with a reason', async () => {
    s.status = inactive('champion', 'manual')
    const res = await middleware(req('/champion/gatekeepers'))
    expect(location(res)).toBe('/champion/login?error=account_inactive')
    expect(s.signOuts).toBe(1)
  })

  it('club deactivated → "club inactive" message', async () => {
    s.status = inactive('champion', 'club_deactivated')
    expect(location(await middleware(req('/champion')))).toBe('/champion/login?error=club_inactive')
  })

  it('deactivated Super Admin → signed out', async () => {
    s.status = inactive('super_admin', 'manual')
    expect(location(await middleware(req('/super-admin/clubs')))).toBe('/login?error=account_inactive')
    expect(s.signOuts).toBe(1)
  })

  it('signed in with no profile → signed out', async () => {
    s.status = null
    expect(location(await middleware(req('/super-admin')))).toBe('/login?error=account_inactive')
    expect(s.signOuts).toBe(1)
  })

  it('deactivated user calling a server action → signed out, no redirect (the action then finds no user)', async () => {
    s.status = inactive('champion', 'manual')
    const res = await middleware(req('/champion/gatekeepers', { method: 'POST', headers: { 'next-action': 'abc' } }))
    expect(location(res)).toBeNull()
    expect(s.signOuts).toBe(1)
  })

  it('deactivated user with an old cookie on the login page → signed out, stays on login (no loop)', async () => {
    s.status = inactive('champion', 'manual')
    const res = await middleware(req('/champion/login'))
    expect(location(res)).toBeNull()
    expect(s.signOuts).toBe(1)
  })

  it('reactivated user → allowed again', async () => {
    s.status = active('champion')
    expect(location(await middleware(req('/champion')))).toBeNull()
  })

  it('status check fails (database error) → not signed out; role gating still uses the profile', async () => {
    s.rpcError = true
    s.fallbackProfile = active('champion')
    expect(location(await middleware(req('/champion')))).toBeNull()
    expect(location(await middleware(req('/super-admin')))).toBe('/champion')
    expect(s.signOuts).toBe(0)
  })

  it('reset-password page (public, reads no data) is not interrupted', async () => {
    s.status = inactive('gatekeeper', 'manual')
    expect(location(await middleware(req('/reset-password')))).toBeNull()
    expect(s.signOuts).toBe(0)
  })
})
