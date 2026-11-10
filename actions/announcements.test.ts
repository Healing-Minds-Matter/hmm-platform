import { beforeEach, describe, expect, it, vi } from 'vitest'

// Creating and editing announcements with several clubs or all clubs. The
// database is faked: what matters here is what reaches save_announcement.
// The database's own rules are tested in supabase/tests/announcement-clubs-rls.mjs.
const db = vi.hoisted(() => ({
  caller: { role: 'super_admin' as string, club_id: null as string | null },
  existing: { id: 'ann-1', is_all_clubs: false, announcement_clubs: [{ club_id: 'old-club' }] } as Record<string, unknown> | null,
  rpcCalls: [] as Record<string, unknown>[],
  rpcError: null as { code?: string; message: string } | null,
  allowed: { publish_club_announcements: true, delete_announcements: false } as Record<string, boolean>,
  deleted: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: () => {
        if (table === 'profiles') return { eq: () => ({ single: async () => ({ data: db.caller }) }) }
        if (table === 'clubs') return { eq: async () => ({ data: [{ id: 'own-club' }, { id: 'club-a' }, { id: 'club-b' }] }) }
        return { eq: () => ({ maybeSingle: async () => ({ data: db.existing }) }) }
      },
      delete: () => ({ eq: async (_c: string, id: string) => { db.deleted.push(id); return { error: null } } }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'cert_can') return { data: db.allowed[args.p_permission as string] === true }
      // Deleting is a soft delete through this database function now.
      if (fn === 'soft_delete_announcement') { db.deleted.push(args.p_id as string); return { data: true, error: null } }
      db.rpcCalls.push(args)
      return { data: db.rpcError ? null : 'ann-new', error: db.rpcError }
    },
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
const adminDb = vi.hoisted(() => ({ clubFilter: [] as string[] }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ in: (_c: string, ids: string[]) => { adminDb.clubFilter = ids; return { in: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) } } }) }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction } from '@/actions/announcements'

function form(audience: string, scope: 'all' | 'selected' | null, clubIds: string[] = []) {
  const f = new FormData()
  f.set('title', 'Notice')
  f.set('body', 'Hello')
  f.set('publish_date', '2026-11-01')
  f.set('audience', audience)
  if (scope) f.set('club_scope', scope)
  for (const id of clubIds) f.append('club_ids', id)
  return f
}

beforeEach(() => {
  db.caller = { role: 'super_admin', club_id: null }
  db.rpcCalls = []
  db.rpcError = null
  db.allowed = { publish_club_announcements: true, delete_announcements: false }
  db.deleted = []
})

describe('Super Admin', () => {
  it('posts to several clubs', async () => {
    expect(await createAnnouncementAction(null, form('specific_clubs', 'selected', ['club-a', 'club-b']))).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_announcement_id: null, p_audience: 'specific_clubs', p_is_all_clubs: false, p_club_ids: ['club-a', 'club-b'] })
  })

  it('posts to all clubs', async () => {
    expect(await createAnnouncementAction(null, form('specific_clubs', 'all'))).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_is_all_clubs: true, p_club_ids: [] })
  })

  it('must pick a club for Specific Cohort', async () => {
    expect(await createAnnouncementAction(null, form('specific_clubs', 'selected'))).toEqual({
      error: 'Please choose at least one club.', fieldErrors: { club_ids: 'Please choose at least one club.' },
    })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('keeps an inactive club the announcement already has when editing', async () => {
    const f = form('specific_clubs', 'selected', ['old-club', 'club-a'])
    f.set('announcement_id', 'ann-1')
    expect(await updateAnnouncementAction(null, f)).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_announcement_id: 'ann-1', p_club_ids: ['old-club', 'club-a'] })
  })

  it('other audiences save no clubs', async () => {
    expect(await createAnnouncementAction(null, form('gatekeepers', 'selected', ['club-a']))).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_audience: 'gatekeepers', p_is_all_clubs: false, p_club_ids: [] })
  })
})

describe('Champion', () => {
  it('always posts to their own club only, whatever is sent', async () => {
    db.caller = { role: 'champion', club_id: 'own-club' }
    expect(await createAnnouncementAction(null, form('specific_clubs', 'all'))).toEqual({ success: true })
    expect(await createAnnouncementAction(null, form('specific_clubs', 'selected', ['club-a', 'club-b']))).toEqual({ success: true })
    for (const call of db.rpcCalls) expect(call).toMatchObject({ p_audience: 'specific_clubs', p_is_all_clubs: false, p_club_ids: ['own-club'] })
  })
})

it('turns a database refusal into plain words', async () => {
  db.rpcError = { code: '42501', message: 'new row violates row-level security policy for table "announcement_clubs"' }
  expect(await createAnnouncementAction(null, form('specific_clubs', 'selected', ['club-a']))).toEqual({
    error: "You don't have permission to do that for this announcement or club.",
  })
})

// Sheet row 61: Champions are limited by their permissions — checked on the
// server for direct calls, not only by hiding the buttons.
describe('Champion permissions', () => {
  beforeEach(() => { db.caller = { role: 'champion', club_id: 'own-club' } })

  it('needs publish_club_announcements to create or edit', async () => {
    db.allowed.publish_club_announcements = false
    expect(await createAnnouncementAction(null, form('specific_clubs', 'selected', ['own-club']))).toEqual({
      error: "You don't have permission to publish announcements.",
    })
    const f = form('specific_clubs', 'selected', ['own-club'])
    f.set('announcement_id', 'ann-1')
    expect(await updateAnnouncementAction(null, f)).toEqual({ error: "You don't have permission to edit announcements." })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('needs delete_announcements to delete', async () => {
    const f = new FormData()
    const ANN = '77777777-7777-4777-8777-777777777777'
    f.set('announcement_id', ANN)
    await deleteAnnouncementAction(f)
    expect(db.deleted).toEqual([])
    db.allowed.delete_announcements = true
    await deleteAnnouncementAction(f)
    expect(db.deleted).toEqual([ANN])
  })

  it('may narrow to people in their own club', async () => {
    const f = form('specific_clubs', 'selected', ['own-club'])
    f.append('recipient_ids', 'gk-1')
    expect(await createAnnouncementAction(null, f)).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_club_ids: ['own-club'], p_recipient_ids: ['gk-1'] })
  })
})

// Sheet rows 71 and 72, checked on the server with field-level errors.
describe('schedule', () => {
  const later = (date: string, time = '', expiryDate = '', expiryTime = '') => {
    const f = form('all', null)
    f.set('schedule_mode', 'later')
    f.set('publish_date', date)
    if (time) f.set('publish_time', time)
    if (expiryDate) f.set('expiry_date', expiryDate)
    if (expiryTime) f.set('expiry_time', expiryTime)
    return f
  }
  const slToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date())

  it('today needs a time', async () => {
    expect((await createAnnouncementAction(null, later(slToday)))?.fieldErrors).toEqual({
      publish_time: 'The publication date is today, so choose a time later than now.',
    })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('refuses an expiry before the publication', async () => {
    expect((await createAnnouncementAction(null, later('2099-01-02', '10:00', '2099-01-02', '09:00')))?.fieldErrors).toEqual({
      expiry_time: 'The expiry date and time must be after the publication date and time.',
    })
  })

  it('stores Sri Lanka times as UTC', async () => {
    expect(await createAnnouncementAction(null, later('2099-01-02', '10:00', '2099-01-03', '08:30'))).toEqual({ success: true })
    expect(db.rpcCalls[0]).toMatchObject({ p_publish_date: '2099-01-02T04:30:00.000Z', p_expiry_date: '2099-01-03T03:00:00.000Z' })
  })

  it('maps the database refusing an expiry to the expiry field', async () => {
    db.rpcError = { code: '23514', message: 'The expiry date and time must be after the publication date and time.' }
    expect((await createAnnouncementAction(null, later('2099-01-02', '10:00')))?.fieldErrors)
      .toEqual({ expiry_date: 'The expiry date and time must be after the publication date and time.' })
  })
})

// Sheet row 38: the people picker. A Champion sees every Champion and
// Gatekeeper in their own club (read on the server), never another club's.
describe('listCohortPeopleAction', () => {
  it('limits a Champion to their own club, whatever clubs are asked for', async () => {
    db.caller = { role: 'champion', club_id: 'own-club' }
    adminDb.clubFilter = []
    const { listCohortPeopleAction } = await import('@/actions/announcements')
    await listCohortPeopleAction(['club-a', 'club-b'])
    expect(adminDb.clubFilter).toEqual(['own-club'])
  })
  it('gives a Gatekeeper nothing', async () => {
    db.caller = { role: 'gatekeeper', club_id: 'own-club' }
    const { listCohortPeopleAction } = await import('@/actions/announcements')
    expect(await listCohortPeopleAction(['own-club'])).toEqual([])
  })
})
