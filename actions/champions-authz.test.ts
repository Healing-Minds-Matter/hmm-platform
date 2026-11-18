import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security Finding 1: only an active Super Admin can create Champion accounts,
// and only into a club that exists and is active. The action is called here
// exactly as a forged browser request would call it — with whatever form
// fields the caller likes — as every kind of caller.

const CLUB_A = '11111111-1111-4111-8111-111111111111'
const CLUB_B = '22222222-2222-4222-8222-222222222222'
const CLUB_OFF = '33333333-3333-4333-8333-333333333333'
const CLUB_MISSING = '44444444-4444-4444-8444-444444444444'

type Profile = { id: string; role: string; club_id: string | null; is_active: boolean; email: string }

const db = vi.hoisted(() => ({
  userId: null as string | null,
  profiles: [] as Profile[],
  clubs: [] as { id: string; name: string; is_active: boolean }[],
  inserts: [] as { client: 'user' | 'admin'; table: string; row: Record<string, unknown> }[],
}))

// A tiny stand-in for the Supabase query builder: select().eq()...maybeSingle()/single(), insert().
function table(client: 'user' | 'admin', name: string) {
  const rows = () => (name === 'profiles' ? db.profiles : name === 'clubs' ? db.clubs : []) as Record<string, unknown>[]
  const filters: [string, unknown][] = []
  const match = () => rows().filter(r => filters.every(([c, v]) => r[c] === v))
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    single: async () => ({ data: match()[0] ?? null, error: match()[0] ? null : { message: 'not found' } }),
    insert: async (row: Record<string, unknown>) => { db.inserts.push({ client, table: name, row }); return { error: null } },
  }
  return builder
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: db.userId ? { id: db.userId } : null } }),
      // A verified (aal2) session, as a Super Admin has after two-step verification (Review Finding 8).
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    },
    from: (name: string) => table('user', name),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (name: string) => table('admin', name),
    auth: { admin: { deleteUser: vi.fn() } },
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/create-invited-user', () => ({ createAuthAccount: vi.fn(async () => ({ userId: 'new-champion' })) }))
vi.mock('@/lib/account-setup.server', () => ({ issueAccountSetupInvite: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/delegations.server', () => ({ endDelegationsForDeactivatedUser: vi.fn() }))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null),
  describePhoneDbError: vi.fn(() => null),
  phoneChanged: vi.fn(() => true),
}))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

import { createChampionAction } from '@/actions/champions'
import { createAuthAccount } from '@/lib/create-invited-user'
import { issueAccountSetupInvite } from '@/lib/account-setup.server'
import { writeAuditLog } from '@/lib/audit'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const valid = { full_name: 'Maya Lin', email: 'maya@example.com', phone: '', club_id: CLUB_A }

beforeEach(() => {
  db.userId = null
  db.inserts = []
  db.clubs = [
    { id: CLUB_A, name: 'Club A', is_active: true },
    { id: CLUB_B, name: 'Club B', is_active: true },
    { id: CLUB_OFF, name: 'Club Off', is_active: false },
  ]
  db.profiles = [
    { id: 'sa', role: 'super_admin', club_id: null, is_active: true, email: 'sa@example.com' },
    { id: 'sa-off', role: 'super_admin', club_id: null, is_active: false, email: 'sa-off@example.com' },
    { id: 'champ-a', role: 'champion', club_id: CLUB_A, is_active: true, email: 'ca@example.com' },
    { id: 'gk-a', role: 'gatekeeper', club_id: CLUB_A, is_active: true, email: 'gk@example.com' },
  ]
  vi.mocked(createAuthAccount).mockClear()
  vi.mocked(writeAuditLog).mockClear()
})

const noAccountCreated = () => {
  expect(createAuthAccount).not.toHaveBeenCalled()
  expect(db.inserts).toEqual([])
  expect(writeAuditLog).not.toHaveBeenCalled()
}

describe('createChampionAction: who may call it', () => {
  it('not signed in → sent to login, nothing created', async () => {
    await expect(createChampionAction(null, form(valid))).rejects.toThrow('NEXT_REDIRECT')
    noAccountCreated()
  })

  it('Gatekeeper → refused', async () => {
    db.userId = 'gk-a'
    expect((await createChampionAction(null, form(valid)))?.error).toMatch(/only super admins/i)
    noAccountCreated()
  })

  it('Champion, own club → refused', async () => {
    db.userId = 'champ-a'
    expect((await createChampionAction(null, form(valid)))?.error).toMatch(/only super admins/i)
    noAccountCreated()
  })

  it('Champion, other club → refused', async () => {
    db.userId = 'champ-a'
    expect((await createChampionAction(null, form({ ...valid, club_id: CLUB_B })))?.error).toMatch(/only super admins/i)
    noAccountCreated()
  })

  it('deactivated Super Admin → refused', async () => {
    db.userId = 'sa-off'
    expect((await createChampionAction(null, form(valid)))?.error).toMatch(/deactivated/i)
    noAccountCreated()
  })

  it('signed in but no profile → refused', async () => {
    db.userId = 'ghost'
    expect((await createChampionAction(null, form(valid)))?.success).toBeUndefined()
    noAccountCreated()
  })

  it('active Super Admin → Champion created, profile written with the caller’s own client (RLS applies)', async () => {
    db.userId = 'sa'
    expect(await createChampionAction(null, form(valid))).toEqual({ success: true })
    expect(createAuthAccount).toHaveBeenCalledOnce()
    // Review Finding 3: a set-password link, never a temporary password.
    expect(issueAccountSetupInvite).toHaveBeenCalledWith({ userId: 'new-champion', requestedBy: 'sa' })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0].client).toBe('user')
    expect(db.inserts[0].row).toMatchObject({ id: 'new-champion', role: 'champion', club_id: CLUB_A, is_active: true })
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'sa', action: 'champion.created' }))
  })
})

describe('createChampionAction: input is validated on the server', () => {
  beforeEach(() => { db.userId = 'sa' })

  it('club that does not exist → field error, nothing created', async () => {
    expect((await createChampionAction(null, form({ ...valid, club_id: CLUB_MISSING })))?.fieldErrors)
      .toEqual({ club_id: 'Club not found.' })
    noAccountCreated()
  })

  it('inactive club → field error, nothing created', async () => {
    expect(Object.keys((await createChampionAction(null, form({ ...valid, club_id: CLUB_OFF })))?.fieldErrors ?? {}))
      .toEqual(['club_id'])
    noAccountCreated()
  })

  it('club id that is not a UUID → field error, nothing created', async () => {
    expect(Object.keys((await createChampionAction(null, form({ ...valid, club_id: "x' OR 1=1" })))?.fieldErrors ?? {}))
      .toEqual(['club_id'])
    noAccountCreated()
  })

  it('malformed email → field error, nothing created', async () => {
    expect(Object.keys((await createChampionAction(null, form({ ...valid, email: 'not-an-email' })))?.fieldErrors ?? {}))
      .toEqual(['email'])
    noAccountCreated()
  })

  it('role / is_active sent by the client are ignored', async () => {
    await createChampionAction(null, form({ ...valid, role: 'super_admin', is_active: 'false' }))
    expect(db.inserts[0].row).toMatchObject({ role: 'champion', is_active: true })
  })
})
