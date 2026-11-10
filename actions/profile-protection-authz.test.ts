import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Security Finding 3: the server actions that change protected profile
// fields (status, club, email) check who is calling and their scope, and
// never write an email directly — a new email waits for the new address to
// confirm. Called as each kind of user, as a forged request would.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLUB_A = id(901), CLUB_B = id(902), CLUB_OFF = id(903)
const SA = id(1), SA_OFF = id(2), CH_A = id(3), CH_B = id(4), GK_A = id(5), GK_B = id(6), GK_A_SELF = GK_A

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, me: null as string | null, emailRequests: [] as unknown[] }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(h.db, 'user', h.me) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/email-change.server', () => ({
  isEmailAvailable: vi.fn(async () => true),
  requestAccountEmailChange: vi.fn(async (p: unknown) => { h.emailRequests.push(p); return { ok: true } }),
}))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null), describePhoneDbError: vi.fn(() => null), phoneChanged: vi.fn(() => false),
  findPhoneClash: vi.fn(), loadPhoneOwners: vi.fn(),
}))
vi.mock('@/lib/invite-gatekeeper', () => ({ createGatekeeperWithTempPassword: vi.fn(), resendGatekeeperWelcomeEmail: vi.fn() }))
vi.mock('@/lib/create-invited-user', () => ({ createInvitedUser: vi.fn() }))
vi.mock('@/lib/delegations.server', () => ({ endDelegationsForDeactivatedUser: vi.fn() }))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

import { updateGatekeeperAction, deactivateGatekeeperAction, reactivateGatekeeperAction } from '@/actions/gatekeepers'
import { updateChampionAction, deactivateChampionAction, reactivateChampionAction } from '@/actions/champions'
import { deactivateClubAction, reactivateClubAction } from '@/actions/clubs'
import { writeAuditLog } from '@/lib/audit'

const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d }
const profile = (pid: string) => h.db.tables.profiles.find(p => p.id === pid)!
const profileWrites = () => h.db.writes.filter(w => w.table === 'profiles' || w.table === 'auth.users' || w.table === 'clubs')

beforeEach(() => {
  h.me = null
  h.emailRequests = []
  vi.mocked(writeAuditLog).mockClear()
  const p = (pid: string, role: string, club_id: string | null, extra: Record<string, unknown> = {}) =>
    ({ id: pid, role, club_id, is_active: true, email: `${pid}@example.com`, phone: '+94771234567', version: 1, full_name: 'X', ...extra })
  h.db = createFakeDb({
    clubs: [{ id: CLUB_A, name: 'A', is_active: true }, { id: CLUB_B, name: 'B', is_active: true }, { id: CLUB_OFF, name: 'Off', is_active: false }],
    profiles: [
      p(SA, 'super_admin', null), p(SA_OFF, 'super_admin', null, { is_active: false }),
      p(CH_A, 'champion', CLUB_A), p(CH_B, 'champion', CLUB_B),
      p(GK_A, 'gatekeeper', CLUB_A), p(GK_B, 'gatekeeper', CLUB_B),
    ],
  })
})

const gkEdit = (over: Record<string, string> = {}) => form({
  gatekeeper_id: GK_A, version: '1', full_name: 'Asha', email: `${GK_A}@example.com`, phone: '0771234567', preferred_language: 'en', club_id: CLUB_A, ...over,
})

describe('updateGatekeeperAction', () => {
  it('not signed in → login, nothing written', async () => {
    await expect(updateGatekeeperAction(null, gkEdit())).rejects.toThrow('NEXT_REDIRECT')
    expect(profileWrites()).toEqual([])
  })
  it('the Gatekeeper themselves → refused (can’t change own email / club through this action)', async () => {
    h.me = GK_A_SELF
    expect((await updateGatekeeperAction(null, gkEdit({ email: 'mine@example.com', club_id: CLUB_B })))?.error).toBeTruthy()
    expect(profileWrites()).toEqual([])
  })
  it('Champion of another club → refused', async () => {
    h.me = CH_B
    expect((await updateGatekeeperAction(null, gkEdit()))?.error).toBeTruthy()
    expect(profileWrites()).toEqual([])
  })
  it('deactivated Super Admin → refused', async () => {
    h.me = SA_OFF
    expect((await updateGatekeeperAction(null, gkEdit()))?.error).toMatch(/deactivated/i)
    expect(profileWrites()).toEqual([])
  })
  it('Champion, own club → saved', async () => {
    h.me = CH_A
    expect(await updateGatekeeperAction(null, gkEdit({ full_name: 'Asha P' }))).toMatchObject({ success: true })
    expect(profile(GK_A).full_name).toBe('Asha P')
  })
  it('Champion can’t move a Gatekeeper to another club', async () => {
    h.me = CH_A
    expect(Object.keys((await updateGatekeeperAction(null, gkEdit({ club_id: CLUB_B })))?.fieldErrors ?? {})).toEqual(['club_id'])
    expect(profile(GK_A).club_id).toBe(CLUB_A)
  })
  it('Super Admin can’t move a Gatekeeper into an inactive club', async () => {
    h.me = SA
    expect(Object.keys((await updateGatekeeperAction(null, gkEdit({ club_id: CLUB_OFF })))?.fieldErrors ?? {})).toEqual(['club_id'])
  })
  it('email change: never written directly, sent for confirmation instead', async () => {
    h.me = CH_A
    const r = await updateGatekeeperAction(null, gkEdit({ email: 'Takeover@Example.com' }))
    expect(r).toMatchObject({ success: true, emailPending: 'takeover@example.com' })
    expect(profile(GK_A).email).toBe(`${GK_A}@example.com`)
    expect(h.db.writes.some(w => w.table === 'auth.users')).toBe(false)
    expect(h.db.writes.filter(w => w.table === 'profiles').every(w => !('email' in w.values))).toBe(true)
    expect(h.emailRequests).toEqual([expect.objectContaining({ userId: GK_A, newEmail: 'takeover@example.com', requestedBy: CH_A })])
  })
  it('target that is not a Gatekeeper → refused', async () => {
    h.me = SA
    expect((await updateGatekeeperAction(null, gkEdit({ gatekeeper_id: CH_A })))?.error).toMatch(/not found/i)
  })
})

describe('deactivate / reactivate Gatekeeper', () => {
  it('Champion, other club → refused', async () => {
    h.me = CH_B
    expect((await deactivateGatekeeperAction(null, form({ gatekeeper_id: GK_A })))?.error).toBeTruthy()
    expect(profile(GK_A).is_active).toBe(true)
  })
  it('Gatekeeper → refused', async () => {
    h.me = GK_B
    expect((await deactivateGatekeeperAction(null, form({ gatekeeper_id: GK_A })))?.error).toBeTruthy()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('Champion, own club → deactivated, audited', async () => {
    h.me = CH_A
    expect(await deactivateGatekeeperAction(null, form({ gatekeeper_id: GK_A }))).toEqual({ success: true })
    expect(profile(GK_A).is_active).toBe(false)
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorId: CH_A, action: 'gatekeeper.deactivated' }))
  })
  it('Champion can’t reactivate into another club', async () => {
    h.me = CH_A
    profile(GK_A).is_active = false
    expect(Object.keys((await reactivateGatekeeperAction(null, form({ gatekeeper_id: GK_A, club_id: CLUB_B })))?.fieldErrors ?? {})).toEqual(['club_id'])
    expect(profile(GK_A).is_active).toBe(false)
  })
})

describe('Champion account actions (Super Admin only)', () => {
  const chEdit = (over: Record<string, string> = {}) => form({ champion_id: CH_A, version: '1', full_name: 'C', email: `${CH_A}@example.com`, phone: '', club_id: CLUB_A, ...over })
  it.each([['Gatekeeper', GK_A], ['Champion (self)', CH_A], ['Champion (other club)', CH_B], ['deactivated Super Admin', SA_OFF]])('%s → refused everywhere', async (_l, who) => {
    h.me = who
    expect((await updateChampionAction(null, chEdit({ club_id: CLUB_B })))?.error).toBeTruthy()
    expect((await deactivateChampionAction(null, form({ champion_id: CH_A })))?.error).toBeTruthy()
    expect((await reactivateChampionAction(null, form({ champion_id: CH_A, club_id: CLUB_A })))?.error).toBeTruthy()
    expect(profileWrites()).toEqual([])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('Super Admin: edit works; email goes to confirmation', async () => {
    h.me = SA
    expect(await updateChampionAction(null, chEdit({ email: 'new-ch@example.com' }))).toMatchObject({ success: true, emailPending: 'new-ch@example.com' })
    expect(profile(CH_A).email).toBe(`${CH_A}@example.com`)
  })
  it('Super Admin: can’t "deactivate a Champion" that is really a Gatekeeper/Super Admin id', async () => {
    h.me = SA
    expect((await deactivateChampionAction(null, form({ champion_id: SA })))?.error).toMatch(/not found/i)
    expect(profile(SA).is_active).toBe(true)
  })
})

describe('club deactivate / reactivate (Super Admin only)', () => {
  it.each([['Champion', CH_A], ['Gatekeeper', GK_A], ['deactivated Super Admin', SA_OFF]])('%s → nothing changes', async (_l, who) => {
    h.me = who
    await deactivateClubAction(form({ club_id: CLUB_A }))
    await reactivateClubAction(form({ club_id: CLUB_OFF }))
    expect(profileWrites()).toEqual([])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('Super Admin → club and its members deactivated', async () => {
    h.me = SA
    await deactivateClubAction(form({ club_id: CLUB_A }))
    expect(h.db.tables.clubs.find(c => c.id === CLUB_A)!.is_active).toBe(false)
    expect(profile(GK_A)).toMatchObject({ is_active: false, deactivation_reason: 'club_deactivated' })
  })
})
