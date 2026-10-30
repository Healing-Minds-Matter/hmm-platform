import { beforeEach, describe, expect, it, vi } from 'vitest'

// Creating, editing and cancelling events by role. The database is faked:
// what matters here is which requests the actions let through and what
// they send to save_event. The database's own rules (RLS, triggers) are
// tested separately against the real database — see the test report.
type FakeEvent = { id: string; title: string; created_by: string; is_cancelled: boolean; is_all_clubs: boolean; event_clubs: { club_id: string }[] }

const db = vi.hoisted(() => ({
  caller: { id: 'user-1', role: 'super_admin' as string, club_id: null as string | null },
  activeClubs: ['own-club', 'club-a', 'club-b'],
  events: {} as Record<string, FakeEvent>,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcError: null as { code?: string; message: string } | null,
  cancelled: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: db.caller.id } } }) },
    from: (table: string) => ({
      select: () => {
        if (table === 'profiles') return { eq: () => ({ single: async () => ({ data: db.caller }) }) }
        if (table === 'clubs') return { eq: async () => ({ data: db.activeClubs.map(id => ({ id })) }) }
        return { eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: db.events[id] ?? null }) }) }
      },
      update: () => ({
        eq: (_c: string, id: string) => ({
          select: async () => {
            db.cancelled.push(id)
            return { data: [{ id }], error: null }
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args })
      return { data: db.rpcError ? null : 'new-event', error: db.rpcError }
    },
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { cancelEventAction, createEventAction, updateEventAction } from '@/actions/events'

function eventForm(scope: 'all' | 'selected', clubIds: string[], extra: Record<string, string> = {}) {
  const form = new FormData()
  const fields = {
    title: 'Awareness Day', type: 'awareness_program', event_date: '2026-11-20', start_time: '10:00',
    facilitator: 'Dr. Perera', venue: 'Town Hall', club_scope: scope, ...extra,
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  for (const id of clubIds) form.append('club_ids', id)
  return form
}
const editForm = (eventId: string, scope: 'all' | 'selected', clubIds: string[]) => {
  const form = eventForm(scope, clubIds)
  form.set('event_id', eventId)
  return form
}
const cancelForm = (eventId: string) => {
  const form = new FormData()
  form.set('event_id', eventId)
  return form
}
const event = (id: string, createdBy: string, clubs: string[] | 'all'): FakeEvent => ({
  id, title: id, created_by: createdBy, is_cancelled: false,
  is_all_clubs: clubs === 'all', event_clubs: clubs === 'all' ? [] : clubs.map(club_id => ({ club_id })),
})
const asSuperAdmin = () => { db.caller = { id: 'admin', role: 'super_admin', club_id: null } }
const asChampion = () => { db.caller = { id: 'champ', role: 'champion', club_id: 'own-club' } }
const saved = () => db.rpcCalls.filter(c => c.fn === 'save_event').map(c => c.args)

beforeEach(() => {
  asSuperAdmin()
  db.rpcCalls = []
  db.rpcError = null
  db.cancelled = []
  db.events = Object.fromEntries([
    event('champ-own', 'champ', ['own-club']),
    event('other-champ-own', 'other-champ', ['own-club']),
    event('multi', 'champ', ['own-club', 'club-a']),
    event('all', 'admin', 'all'),
    event('other-club', 'other-champ', ['club-a']),
  ].map(e => [e.id, e]))
})

describe('Super Admin', () => {
  it('creates an event for all clubs', async () => {
    expect(await createEventAction(null, eventForm('all', []))).toEqual({ success: true })
    expect(saved()[0]).toMatchObject({ p_event_id: null, p_is_all_clubs: true, p_club_ids: [] })
  })

  it('creates an event for one club, or for several', async () => {
    expect(await createEventAction(null, eventForm('selected', ['club-a']))).toEqual({ success: true })
    expect(await createEventAction(null, eventForm('selected', ['club-a', 'club-b']))).toEqual({ success: true })
    expect(saved().map(a => a.p_club_ids)).toEqual([['club-a'], ['club-a', 'club-b']])
  })

  it('must choose "All clubs" or at least one club', async () => {
    expect(await createEventAction(null, eventForm('selected', []))).toEqual({ error: 'Please choose at least one club.' })
    expect(saved()).toHaveLength(0)
  })

  it('can\'t newly pick an inactive club', async () => {
    const result = await createEventAction(null, eventForm('selected', ['closed-club']))
    expect(result?.error).toMatch(/inactive/)
  })

  it('edits an event\'s clubs: selected → all, and all → selected', async () => {
    expect(await updateEventAction(null, editForm('multi', 'all', []))).toEqual({ success: true })
    expect(await updateEventAction(null, editForm('all', 'selected', ['club-b']))).toEqual({ success: true })
    expect(saved()).toMatchObject([
      { p_event_id: 'multi', p_is_all_clubs: true, p_club_ids: [] },
      { p_event_id: 'all', p_is_all_clubs: false, p_club_ids: ['club-b'] },
    ])
  })

  it('edits and cancels an event a Champion created', async () => {
    expect(await updateEventAction(null, editForm('champ-own', 'selected', ['own-club', 'club-a']))).toEqual({ success: true })
    expect(await cancelEventAction(null, cancelForm('champ-own'))).toEqual({ success: true })
    expect(db.cancelled).toEqual(['champ-own'])
  })
})

describe('Champion', () => {
  beforeEach(asChampion)

  it('creates an event for their own club', async () => {
    expect(await createEventAction(null, eventForm('selected', ['own-club']))).toEqual({ success: true })
    expect(saved()[0]).toMatchObject({ p_is_all_clubs: false, p_club_ids: ['own-club'] })
  })

  it('is refused another club, several clubs or all clubs', async () => {
    const refused = { error: 'You can only schedule events for your own club.' }
    expect(await createEventAction(null, eventForm('selected', ['club-a']))).toEqual(refused)
    expect(await createEventAction(null, eventForm('selected', ['own-club', 'club-a']))).toEqual(refused)
    expect(await createEventAction(null, eventForm('all', []))).toEqual(refused)
    expect(saved()).toHaveLength(0)
  })

  it('edits and cancels an event they created for their own club', async () => {
    expect(await updateEventAction(null, editForm('champ-own', 'selected', ['own-club']))).toEqual({ success: true })
    expect(await cancelEventAction(null, cancelForm('champ-own'))).toEqual({ success: true })
  })

  it('can\'t change the clubs of their own event', async () => {
    expect(await updateEventAction(null, editForm('champ-own', 'all', []))).toEqual({ error: 'You can only schedule events for your own club.' })
    expect(await updateEventAction(null, editForm('champ-own', 'selected', ['own-club', 'club-a']))).toEqual({ error: 'You can only schedule events for your own club.' })
  })

  it('can\'t edit or cancel multi-club, all-club, other-club or another Champion\'s events', async () => {
    const refused = { error: 'You can only edit or cancel events you created for your own club.' }
    for (const id of ['multi', 'all', 'other-club', 'other-champ-own']) {
      expect(await updateEventAction(null, editForm(id, 'selected', ['own-club']))).toEqual(refused)
      expect(await cancelEventAction(null, cancelForm(id))).toEqual(refused)
    }
    expect(saved()).toHaveLength(0)
    expect(db.cancelled).toHaveLength(0)
  })
})

describe('both roles', () => {
  it('keep the other required fields required', async () => {
    expect(await createEventAction(null, eventForm('all', [], { venue: '' }))).toEqual({ error: 'Venue / location is required.' })
    expect(await createEventAction(null, eventForm('all', [], { end_time: '09:00' }))).toEqual({ error: 'End time must be after the start time.' })
  })

  it('turn a database refusal into plain words', async () => {
    db.rpcError = { code: '42501', message: 'new row violates row-level security policy for table "event_clubs"' }
    expect(await createEventAction(null, eventForm('selected', ['club-a']))).toEqual({
      error: "You don't have permission to do that for this event or club.",
    })
  })

  it('refuse an event that doesn\'t exist or can\'t be seen', async () => {
    expect(await updateEventAction(null, editForm('missing', 'all', []))).toEqual({ error: 'Event not found.' })
  })
})
