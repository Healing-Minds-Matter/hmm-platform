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
  it('Review Finding 7: a forged request can’t set role, status, code, QPR date or a certificate — the server sets the profile fields itself', async () => {
    h.me = CH_A
    await createGatekeeperAction(null, single({
      send_welcome_email: 'on', role: 'super_admin', is_active: 'false', gatekeeper_code: 'GK-0001',
      qpr_certification_date: '2026-01-15', must_change_password: 'true', club_id: CLUB_B,
    }))
    const insert = h.db.writes.find(w => w.table === 'profiles' && w.op === 'insert')!
    expect(insert.client).toBe('admin') // server code, only after the guard passed
    expect(Object.keys(insert.values).sort()).toEqual(
      ['club_id', 'email', 'full_name', 'gatekeeper_code', 'id', 'is_active', 'must_change_password', 'phone', 'preferred_language', 'role'])
    expect(insert.values).toMatchObject({ role: 'gatekeeper', club_id: CLUB_A, is_active: true, gatekeeper_code: 'GK-1001', must_change_password: false })
    expect(h.db.writes.filter(w => w.table === 'certificates')).toEqual([])
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

// ── Review Finding 13j: one shared schema for single and bulk create ─────────
describe('Review Finding 13j: input checks (single and bulk)', () => {
  const bulk = (rows: string[], intent: 'check' | 'save' = 'save', header = 'full_name,email,phone,club_id') => {
    const d = form({ intent })
    d.set('csv_file', new File([[header, ...rows].join('\n')], 'g.csv', { type: 'text/csv' }))
    return d
  }

  it.each([
    ['full_name', { full_name: 'Asha <script>' }, 'Full name can only contain letters'],
    ['full_name', { full_name: 'x'.repeat(201) }, 'Full name must be 200 characters or fewer.'],
    ['email', { email: 'not-an-email' }, 'Enter a valid email address'],
    ['email', { email: '' }, 'Email is required.'],
    ['phone', { phone: '123' }, 'Enter a valid phone number'],
    ['phone', { phone: '' }, 'Phone number is required.'],
    ['preferred_language', { preferred_language: 'fr' }, 'Choose English, Sinhala or Tamil.'],
    ['club_id', { club_id: 'abc' }, 'Select a valid club'],
  ])('single: bad %s → field error, no account', async (field, over, message) => {
    h.me = SA
    const r = await createGatekeeperAction(null, single(over as Record<string, string>))
    expect(r?.fieldErrors?.[field]).toContain(message)
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('single: Sinhala and Tamil names are accepted', async () => {
    h.me = SA
    expect(await createGatekeeperAction(null, single({ full_name: 'අසංක පෙරේරා' }))).toMatchObject({ success: true })
  })

  it('bulk: the same checks, with a reason for each row; good rows are still registered (partial import, as before)', async () => {
    h.me = SA
    const r = await createGatekeepersBulkAction(null, bulk([
      `Asha Perera,asha@example.com,0771234567,${CLUB_A}`,
      `Bad Email,nope,0771234568,${CLUB_A}`,
      `Bad <b>Name</b>,b@example.com,0771234569,${CLUB_A}`,
      `Bad Club,c@example.com,0771234570,not-a-club`,
      `Dup Phone,d@example.com,077 123 4567,${CLUB_A}`,
    ]))
    expect(r?.results).toEqual([
      expect.objectContaining({ row: 2, status: 'created' }),
      expect.objectContaining({ row: 3, status: 'failed', error: expect.stringContaining('Enter a valid email address') }),
      expect.objectContaining({ row: 4, status: 'failed', error: expect.stringContaining('Full name can only contain letters') }),
      expect.objectContaining({ row: 5, status: 'failed', error: expect.stringContaining('No club has the code "not-a-club"') }),
      expect.objectContaining({ row: 6, status: 'failed', error: expect.stringContaining('Same phone number as row 2') }),
    ])
    expect(createAuthAccount).toHaveBeenCalledTimes(1)
  })

  it('bulk: an optional preferred_language column is checked too', async () => {
    h.me = SA
    const r = await createGatekeepersBulkAction(null, bulk([`Asha Perera,asha@example.com,0771234567,${CLUB_A},xx`], 'check', 'full_name,email,phone,club_id,preferred_language'))
    expect(r?.results?.[0]).toMatchObject({ status: 'failed', error: 'Choose English, Sinhala or Tamil.' })
  })

  it('bulk: Champion — a club_id for another club in the file is ignored (always their own club)', async () => {
    h.me = CH_A
    await createGatekeepersBulkAction(null, bulk([`Asha Perera,asha@example.com,0771234567,${CLUB_B}`]))
    expect(h.db.tables.profiles.find(row => row.id === NEW_USER)?.club_id).toBe(CLUB_A)
  })

  it('bulk: not signed in → login; Gatekeeper → refused; no accounts', async () => {
    await expect(createGatekeepersBulkAction(null, bulk([`Asha Perera,asha@example.com,0771234567,${CLUB_A}`]))).rejects.toThrow('NEXT_REDIRECT')
    h.me = GK
    expect((await createGatekeepersBulkAction(null, bulk([`Asha Perera,asha@example.com,0771234567,${CLUB_A}`])))?.error).toBeTruthy()
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
})
