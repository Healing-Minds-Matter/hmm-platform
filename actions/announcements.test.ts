import { beforeEach, describe, expect, it, vi } from 'vitest'

// Creating and editing announcements with several clubs or all clubs. The
// database is faked: what matters here is what reaches save_announcement.
// The database's own rules are tested in supabase/tests/announcement-clubs-rls.mjs.
const db = vi.hoisted(() => ({
  caller: { role: 'super_admin' as string, club_id: null as string | null },
  existing: { id: 'ann-1', is_all_clubs: false, announcement_clubs: [{ club_id: 'old-club' }] } as Record<string, unknown> | null,
  rpcCalls: [] as Record<string, unknown>[],
  rpcError: null as { code?: string; message: string } | null,
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
    }),
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push(args)
      return { data: db.rpcError ? null : 'ann-new', error: db.rpcError }
    },
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createAnnouncementAction, updateAnnouncementAction } from '@/actions/announcements'

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
    expect(await createAnnouncementAction(null, form('specific_clubs', 'selected'))).toEqual({ error: 'Please choose at least one club.' })
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
