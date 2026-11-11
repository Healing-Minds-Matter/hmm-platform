import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: null as string | null,
  profile: null as { role: string; club_id: string | null; is_active: boolean; must_change_password?: boolean } | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) }),
  }),
}))

import { requireClubScope, requireRole, requireUser, type Caller } from '@/lib/auth/guards.server'

beforeEach(() => { state.userId = 'u1'; state.profile = null })

describe('requireUser', () => {
  it('not signed in → unauthenticated', async () => {
    state.userId = null
    expect(await requireUser()).toMatchObject({ ok: false, reason: 'unauthenticated' })
  })
  it('signed in without a profile → inactive', async () => {
    expect(await requireUser()).toMatchObject({ ok: false, reason: 'inactive' })
  })
  it('deactivated → inactive', async () => {
    state.profile = { role: 'super_admin', club_id: null, is_active: false }
    expect(await requireUser()).toMatchObject({ ok: false, reason: 'inactive' })
  })
  it('temporary password not yet replaced → refused (Review Finding 3)', async () => {
    state.profile = { role: 'champion', club_id: 'c1', is_active: true, must_change_password: true }
    expect(await requireUser()).toMatchObject({ ok: false, reason: 'password_change_required', message: expect.stringMatching(/new password/) })
  })
  it('active → the caller, with role and club from the database', async () => {
    state.profile = { role: 'champion', club_id: 'c1', is_active: true }
    const r = await requireUser()
    expect(r.ok && { id: r.caller.id, role: r.caller.role, clubId: r.caller.clubId }).toEqual({ id: 'u1', role: 'champion', clubId: 'c1' })
  })
})

describe('requireRole', () => {
  it.each([
    ['gatekeeper', false], ['champion', false], ['super_admin', true],
  ])('%s → allowed for super_admin-only: %s', async (role, allowed) => {
    state.profile = { role, club_id: null, is_active: true }
    const r = await requireRole(['super_admin'], 'nope')
    expect(r.ok).toBe(allowed)
    if (!r.ok) expect(r).toMatchObject({ reason: 'forbidden', message: 'nope' })
  })
  it('a deactivated Super Admin is refused as inactive, not by role', async () => {
    state.profile = { role: 'super_admin', club_id: null, is_active: false }
    expect(await requireRole(['super_admin'])).toMatchObject({ ok: false, reason: 'inactive' })
  })
})

describe('requireClubScope', () => {
  const caller = (role: Caller['role'], clubId: string | null) => ({ id: 'u1', role, clubId, supabase: {} }) as unknown as Caller
  it('Super Admin: any club', () => expect(requireClubScope(caller('super_admin', null), 'c2').ok).toBe(true))
  it('Champion: own club only', () => {
    expect(requireClubScope(caller('champion', 'c1'), 'c1').ok).toBe(true)
    expect(requireClubScope(caller('champion', 'c1'), 'c2')).toMatchObject({ ok: false, reason: 'out_of_scope' })
    expect(requireClubScope(caller('champion', 'c1'), null).ok).toBe(false)
  })
  it('a user with no club matches nothing', () => expect(requireClubScope(caller('champion', null), null).ok).toBe(false))
})
