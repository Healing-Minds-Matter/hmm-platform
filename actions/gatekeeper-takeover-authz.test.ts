import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Review Finding 2: a Champion could take over a Gatekeeper account by
// changing its email to their own and then pressing "Resend invite", which
// set and emailed a new password. Now:
//   * a Champion may change a Gatekeeper's email only while that account has
//     never been signed into (correcting a typo in a pending invite); after
//     that only a Super Admin can, through the verified email-change flow;
//   * "Resend invite" works only for accounts that have never been signed
//     into, sends a set-password link to the account's own email, and never
//     creates, returns or emails a password.
// Called as each kind of user, as a forged request would.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLUB_A = id(901), CLUB_B = id(902)
const SA = id(1), SA_OFF = id(2), CH_A = id(3), CH_B = id(4), CH_A_OFF = id(7)
const GK_NEW = id(5)   // never signed in
const GK_USED = id(6)  // has signed in
const GK_B = id(8)     // other club, never signed in

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  me: null as string | null,
  signedIn: new Set<string>(),
  emailRequests: [] as unknown[],
  invites: [] as unknown[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(h.db, 'user', h.me) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/email-change.server', () => ({
  isEmailAvailable: vi.fn(async () => true),
  requestAccountEmailChange: vi.fn(async (p: unknown) => { h.emailRequests.push(p); return { ok: true } }),
}))
vi.mock('@/lib/account-setup.server', () => ({
  hasSignedIn: vi.fn(async (userId: string) => h.signedIn.has(userId)),
  issueAccountSetupInvite: vi.fn(async (p: unknown) => { h.invites.push(p); return { ok: true } }),
}))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null), describePhoneDbError: vi.fn(() => null), phoneChanged: vi.fn(() => false),
  findPhoneClash: vi.fn(), loadPhoneOwners: vi.fn(),
}))
vi.mock('@/lib/create-invited-user', () => ({ createAuthAccount: vi.fn() }))
vi.mock('@/lib/send-email', () => ({ sendGatekeeperWelcomeEmail: vi.fn(), sendAccountSetupEmail: vi.fn() }))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

import { resendGatekeeperInviteAction, updateGatekeeperAction } from '@/actions/gatekeepers'
import { writeAuditLog } from '@/lib/audit'
import { sendGatekeeperWelcomeEmail } from '@/lib/send-email'

const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d }
const passwordWrites = () => h.db.writes.filter(w => w.table === 'auth.users' && 'password' in w.values)

beforeEach(() => {
  h.me = null
  h.emailRequests = []
  h.invites = []
  h.signedIn = new Set([GK_USED, SA, CH_A, CH_B])
  vi.mocked(writeAuditLog).mockClear()
  vi.mocked(sendGatekeeperWelcomeEmail).mockClear()
  const p = (pid: string, role: string, club_id: string | null, extra: Record<string, unknown> = {}) =>
    ({ id: pid, role, club_id, is_active: true, email: `${pid}@example.com`, phone: '+94771234567', version: 1, full_name: 'Asha Perera', ...extra })
  h.db = createFakeDb({
    clubs: [{ id: CLUB_A, name: 'A', is_active: true }, { id: CLUB_B, name: 'B', is_active: true }],
    profiles: [
      p(SA, 'super_admin', null), p(SA_OFF, 'super_admin', null, { is_active: false }),
      p(CH_A, 'champion', CLUB_A), p(CH_B, 'champion', CLUB_B), p(CH_A_OFF, 'champion', CLUB_A, { is_active: false }),
      p(GK_NEW, 'gatekeeper', CLUB_A), p(GK_USED, 'gatekeeper', CLUB_A), p(GK_B, 'gatekeeper', CLUB_B),
    ],
  })
})

const edit = (gk: string, email: string) => form({
  gatekeeper_id: gk, version: '1', full_name: 'Asha Perera', email, phone: '0771234567', preferred_language: 'en', club_id: CLUB_A,
})

describe('changing a Gatekeeper’s email', () => {
  it('Champion, own club, Gatekeeper has signed in → refused on the email field, nothing saved', async () => {
    h.me = CH_A
    const r = await updateGatekeeperAction(null, edit(GK_USED, 'champion.own@example.com'))
    expect(Object.keys(r?.fieldErrors ?? {})).toEqual(['email'])
    expect(r?.fieldErrors?.email).toMatch(/Super Admin/)
    expect(h.emailRequests).toEqual([])
    expect(h.db.writes.filter(w => w.table === 'profiles')).toEqual([])
  })
  it('Champion, own club, Gatekeeper has never signed in → typo correction goes to the new address to confirm', async () => {
    h.me = CH_A
    const r = await updateGatekeeperAction(null, edit(GK_NEW, 'fixed@example.com'))
    expect(r).toMatchObject({ success: true, emailPending: 'fixed@example.com' })
    expect(h.emailRequests).toEqual([expect.objectContaining({ userId: GK_NEW, newEmail: 'fixed@example.com', requestedBy: CH_A })])
  })
  it('Champion, other club → refused', async () => {
    h.me = CH_B
    expect((await updateGatekeeperAction(null, edit(GK_NEW, 'x@example.com')))?.error).toBeTruthy()
    expect(h.emailRequests).toEqual([])
  })
  it('Super Admin, Gatekeeper has signed in → verified email change started', async () => {
    h.me = SA
    expect(await updateGatekeeperAction(null, edit(GK_USED, 'new@example.com'))).toMatchObject({ success: true, emailPending: 'new@example.com' })
    expect(h.emailRequests).toEqual([expect.objectContaining({ userId: GK_USED, requestedBy: SA })])
  })
  it('if the sign-in check can’t be made, a Champion is refused (fails closed)', async () => {
    h.me = CH_A
    const { hasSignedIn } = await import('@/lib/account-setup.server')
    vi.mocked(hasSignedIn).mockRejectedValueOnce(new Error('db down'))
    const r = await updateGatekeeperAction(null, edit(GK_NEW, 'fixed@example.com'))
    expect(r?.success).toBeFalsy()
    expect(h.emailRequests).toEqual([])
  })
})

describe('resendGatekeeperInviteAction', () => {
  const resend = (gk: string) => resendGatekeeperInviteAction(null, form({ gatekeeper_id: gk }))

  it('not signed in → login, nothing sent', async () => {
    await expect(resend(GK_NEW)).rejects.toThrow('NEXT_REDIRECT')
    expect(h.invites).toEqual([])
  })
  it.each([
    ['Gatekeeper', GK_USED],
    ['Champion of another club', CH_B],
    ['deactivated Champion', CH_A_OFF],
    ['deactivated Super Admin', SA_OFF],
  ])('%s → refused, nothing sent or audited', async (_label, who) => {
    h.me = who
    expect((await resend(GK_NEW))?.error).toBeTruthy()
    expect(h.invites).toEqual([])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it.each([['Champion, own club', CH_A], ['Super Admin', SA]])('%s, Gatekeeper has signed in → refused', async (_label, who) => {
    h.me = who
    expect((await resend(GK_USED))?.error).toMatch(/already signed in/)
    expect(h.invites).toEqual([])
  })
  it.each([['Champion, own club', CH_A], ['Super Admin', SA]])('%s, never signed in → set-password link sent, no password anywhere', async (_label, who) => {
    h.me = who
    const r = await resend(GK_NEW)
    expect(r).toEqual({ success: true })
    expect(h.invites).toEqual([expect.objectContaining({ userId: GK_NEW, requestedBy: who })])
    expect(sendGatekeeperWelcomeEmail).not.toHaveBeenCalled()
    expect(passwordWrites()).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/password/i)
  })
  it('a malformed id → refused before anything is looked up', async () => {
    h.me = SA
    expect((await resend('not-a-uuid'))?.error).toBeTruthy()
    expect(h.invites).toEqual([])
  })
  it('a deactivated Gatekeeper → refused', async () => {
    h.me = SA
    h.db.tables.profiles.find(p => p.id === GK_NEW)!.is_active = false
    expect((await resend(GK_NEW))?.error).toBeTruthy()
    expect(h.invites).toEqual([])
  })
})
