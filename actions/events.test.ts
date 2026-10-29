import { beforeEach, describe, expect, it, vi } from 'vitest'

// Creating and editing events with optional, multiple clubs. The database
// is faked: what matters here is which clubs the action lets through and
// that they're saved with set_event_clubs.
const db = vi.hoisted(() => ({
  caller: { role: 'super_admin' as string, club_id: null as string | null },
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcError: null as { message: string } | null,
  deleted: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: table === 'profiles' ? db.caller : null }) }) }),
      insert: (row: Record<string, unknown>) => {
        db.inserted.push(row)
        return { select: () => ({ single: async () => ({ data: { id: 'event-1' }, error: null }) }) }
      },
      update: (row: Record<string, unknown>) => {
        db.updated.push(row)
        return { eq: () => ({ select: async () => ({ data: [{ id: 'event-1' }], error: null }) }) }
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args })
      return { error: db.rpcError }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ delete: () => ({ eq: async (_c: string, id: string) => { db.deleted.push(id); return {} } }) }),
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createEventAction, updateEventAction } from '@/actions/events'

function eventForm(clubIds: string[], extra: Record<string, string> = {}) {
  const form = new FormData()
  const fields = {
    title: 'Awareness Day', type: 'awareness_program', event_date: '2026-11-20', start_time: '10:00',
    facilitator: 'Dr. Perera', venue: 'Town Hall', ...extra,
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  for (const id of clubIds) form.append('club_ids', id)
  return form
}

beforeEach(() => {
  db.caller = { role: 'super_admin', club_id: null }
  db.inserted = []
  db.updated = []
  db.rpcCalls = []
  db.rpcError = null
  db.deleted = []
})

describe('createEventAction', () => {
  it('lets a Super Admin link several clubs', async () => {
    expect(await createEventAction(null, eventForm(['club-a', 'club-b']))).toEqual({ success: true })
    expect(db.inserted[0].club_id).toBeNull()
    expect(db.rpcCalls).toEqual([{ fn: 'set_event_clubs', args: { p_event_id: 'event-1', p_club_ids: ['club-a', 'club-b'] } }])
  })

  it('allows no club at all (open to all clubs)', async () => {
    expect(await createEventAction(null, eventForm([]))).toEqual({ success: true })
    expect(db.rpcCalls[0].args.p_club_ids).toEqual([])
  })

  it('lets a Champion link their own club, or none, but no other club', async () => {
    db.caller = { role: 'champion', club_id: 'own-club' }
    expect(await createEventAction(null, eventForm(['own-club']))).toEqual({ success: true })
    expect(await createEventAction(null, eventForm([]))).toEqual({ success: true })
    expect(await createEventAction(null, eventForm(['own-club', 'other-club']))).toEqual({
      error: 'You can only link an event to your own club.',
    })
    expect(db.inserted).toHaveLength(2)
  })

  it('removes the event again if its clubs could not be saved', async () => {
    db.rpcError = { message: 'denied' }
    expect(await createEventAction(null, eventForm(['club-a']))).toEqual({
      error: 'The event could not be linked to the selected clubs. Please try again.',
    })
    expect(db.deleted).toEqual(['event-1'])
  })

  it('keeps the other required fields required', async () => {
    expect(await createEventAction(null, eventForm([], { venue: '' }))).toEqual({ error: 'Venue / location is required.' })
    expect(await createEventAction(null, eventForm([], { facilitator: '' }))).toEqual({ error: 'Primary facilitator is required.' })
    expect(db.inserted).toHaveLength(0)
  })
})

describe('updateEventAction', () => {
  it('saves the new clubs, including unticking every club', async () => {
    db.caller = { role: 'champion', club_id: 'own-club' }
    const form = eventForm([])
    form.set('event_id', 'event-1')
    expect(await updateEventAction(null, form)).toEqual({ success: true })
    expect(db.updated[0].club_id).toBeNull()
    expect(db.rpcCalls).toEqual([{ fn: 'set_event_clubs', args: { p_event_id: 'event-1', p_club_ids: [] } }])
  })

  it('refuses another club for a Champion', async () => {
    db.caller = { role: 'champion', club_id: 'own-club' }
    const form = eventForm(['other-club'])
    form.set('event_id', 'event-1')
    expect(await updateEventAction(null, form)).toEqual({ error: 'You can only link an event to your own club.' })
    expect(db.updated).toHaveLength(0)
  })
})
