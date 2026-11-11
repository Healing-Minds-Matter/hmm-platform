import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Review Finding 3: Gatekeeper creation (single and bulk) never creates,
// shows, returns or emails a temporary password. The Gatekeeper chooses their
// own from a single-use set-password link, emailed at creation or — with
// "send later" — from their page afterwards. Called as each kind of user.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLUB_A = id(901), CLUB_B = id(902)
const SA = id(1), CH_A = id(3), GK = id(5), CH_OFF = id(7)
const NEW_USER = id(50)

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  me: null as string | null,
  invites: [] as { userId: string; requestedBy: string }[],
  inviteResult: { ok: true } as { ok: true } | { error: string },
  deleted: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(h.db, 'user', h.me) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const c = fakeClient(h.db, 'admin')
    Object.assign(c.auth.admin, { deleteUser: async (uid: string) => { h.deleted.push(uid); return { error: null } } })
    return c
  },
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/create-invited-user', () => ({ createAuthAccount: vi.fn(async () => ({ userId: NEW_USER })) }))
vi.mock('@/lib/account-setup.server', () => ({
  hasSignedIn: vi.fn(async () => false),
  issueAccountSetupInvite: vi.fn(async (p: { userId: string; requestedBy: string }) => { h.invites.push(p); return h.inviteResult }),
}))
vi.mock('@/lib/email-change.server', () => ({ isEmailAvailable: vi.fn(async () => true), requestAccountEmailChange: vi.fn() }))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null), describePhoneDbError: vi.fn(() => null), phoneChanged: vi.fn(() => false),
  findPhoneClash: vi.fn(() => null), loadPhoneOwners: vi.fn(async () => []),
}))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

import { createGatekeeperAction, createGatekeepersBulkAction } from '@/actions/gatekeepers'
import { createAuthAccount } from '@/lib/create-invited-user'
import { BULK_SEND_LATER_NOTE } from '@/lib/account-sign-in'

const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d }
const single = (over: Record<string, string> = {}) => form({
  full_name: 'Asha Perera', email: 'asha@example.com', phone: '0771234567', preferred_language: 'en', club_id: CLUB_A, ...over,
})
const noPasswordAnywhere = (value: unknown) => expect(JSON.stringify(value ?? null)).not.toMatch(/password/i)

beforeEach(() => {
  h.me = null
  h.invites = []
  h.deleted = []
  h.inviteResult = { ok: true }
  vi.mocked(createAuthAccount).mockClear()
  const p = (pid: string, role: string, club_id: string | null, extra: Record<string, unknown> = {}) =>
    ({ id: pid, role, club_id, is_active: true, email: `${pid}@example.com`, full_name: 'X', ...extra })
  h.db = createFakeDb({
    clubs: [{ id: CLUB_A, name: 'A', is_active: true }, { id: CLUB_B, name: 'B', is_active: true }],
    profiles: [p(SA, 'super_admin', null), p(CH_A, 'champion', CLUB_A), p(GK, 'gatekeeper', CLUB_A), p(CH_OFF, 'champion', CLUB_A, { is_active: false })],
  }, { next_gatekeeper_code: () => ({ data: 'GK-1001', error: null }) })
})

describe('createGatekeeperAction (single)', () => {
  it('not signed in → login, no account', async () => {
    await expect(createGatekeeperAction(null, single({ send_welcome_email: 'on' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
  it('Gatekeeper → refused, no account', async () => {
    h.me = GK
    expect((await createGatekeeperAction(null, single({ send_welcome_email: 'on' })))?.error).toBeTruthy()
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
  it('deactivated Champion → refused, no account (even with “send later”)', async () => {
    h.me = CH_OFF
    expect((await createGatekeeperAction(null, single()))?.error).toMatch(/deactivated/i)
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
  it.each([['Champion (own club)', CH_A], ['Super Admin', SA]])('%s, email ticked → set-password link sent, nothing about a password returned', async (_l, who) => {
    h.me = who
    const r = await createGatekeeperAction(null, single({ send_welcome_email: 'on' }))
    expect(r).toEqual({ success: true, inviteDeferred: false })
    noPasswordAnywhere(r)
    expect(h.invites).toEqual([{ userId: NEW_USER, requestedBy: who }])
    const profile = h.db.tables.profiles.find(row => row.id === NEW_USER)!
    expect(profile).toMatchObject({ role: 'gatekeeper', club_id: CLUB_A, must_change_password: false })
  })
  it('Champion’s submitted club is ignored: always their own club', async () => {
    h.me = CH_A
    await createGatekeeperAction(null, single({ club_id: CLUB_B, send_welcome_email: 'on' }))
    expect(h.db.tables.profiles.find(row => row.id === NEW_USER)?.club_id).toBe(CLUB_A)
  })
  it('“send later” (unticked) → account created, no email, the screen is told to say so', async () => {
    h.me = CH_A
    const r = await createGatekeeperAction(null, single())
    expect(r).toEqual({ success: true, inviteDeferred: true })
    noPasswordAnywhere(r)
    expect(h.invites).toEqual([])
  })
  it('the set-password email can’t be sent → the account is removed again, error shown', async () => {
    h.me = CH_A
    h.inviteResult = { error: 'The invite email couldn’t be sent. Please try again.' }
    const r = await createGatekeeperAction(null, single({ send_welcome_email: 'on' }))
    expect(r?.success).toBeFalsy()
    expect(r?.error).toMatch(/not created/)
    expect(h.deleted).toEqual([NEW_USER])
  })
})

describe('createGatekeepersBulkAction', () => {
  const csv = (rows: string[], extra: Record<string, string> = {}) => {
    const d = form({ intent: 'save', ...extra })
    d.set('csv_file', new File([['full_name,email,phone,club_id', ...rows].join('\n')], 'g.csv', { type: 'text/csv' }))
    return d
  }
  it('email ticked → each row gets a link; results carry no password', async () => {
    h.me = SA
    const r = await createGatekeepersBulkAction(null, csv([`Asha Perera,asha@example.com,0771234567,${CLUB_A}`], { send_welcome_email: 'on' }))
    expect(r?.results).toEqual([expect.objectContaining({ status: 'created' })])
    expect(r?.results?.[0].note).toBeUndefined()
    noPasswordAnywhere(r)
    expect(h.invites).toHaveLength(1)
  })
  it('deactivated Champion → whole upload refused, no accounts', async () => {
    h.me = CH_OFF
    const r = await createGatekeepersBulkAction(null, csv([`Asha Perera,asha@example.com,0771234567,${CLUB_A}`]))
    expect(r?.error).toMatch(/deactivated/i)
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
  it('“send later” → rows created with a note, no email, no password', async () => {
    h.me = SA
    const r = await createGatekeepersBulkAction(null, csv([`Asha Perera,asha@example.com,0771234567,${CLUB_A}`]))
    expect(r?.results).toEqual([expect.objectContaining({ status: 'created', note: BULK_SEND_LATER_NOTE })])
    noPasswordAnywhere(r)
    expect(h.invites).toEqual([])
  })
})
