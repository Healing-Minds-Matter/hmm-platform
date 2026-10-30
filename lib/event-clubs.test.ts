import { describe, expect, it } from 'vitest'
import {
  ALL_CLUBS_LABEL,
  MSG_OWN_CLUB_ONLY,
  MSG_PICK_A_CLUB,
  canManageEvent,
  checkClubChoice,
  eventClubIds,
  eventClubsLabel,
  isEventForClub,
  readClubChoice,
} from '@/lib/event-clubs'

const linked = (...ids: string[]) => ({ is_all_clubs: false, event_clubs: ids.map(club_id => ({ club_id })) })
const allClubs = { is_all_clubs: true, event_clubs: [] }

describe('isEventForClub', () => {
  it('matches an event linked to the club, among several', () => {
    expect(isEventForClub(linked('a', 'b'), 'b')).toBe(true)
    expect(isEventForClub(linked('a', 'b'), ['x', 'a'])).toBe(true)
  })

  it('does not match an event linked only to other clubs', () => {
    expect(isEventForClub(linked('a', 'b'), 'c')).toBe(false)
    expect(isEventForClub(linked(), 'c')).toBe(false)
  })

  it('matches an all-club event for every club', () => {
    expect(isEventForClub(allClubs, 'c')).toBe(true)
    expect(eventClubIds({})).toEqual([])
  })

  it('keeps a migrated single-club event showing for its club only', () => {
    const migrated = linked('kandy')
    expect(isEventForClub(migrated, 'kandy')).toBe(true)
    expect(isEventForClub(migrated, 'colombo')).toBe(false)
  })
})

describe('eventClubsLabel', () => {
  const names = { a: 'Kandy', b: 'Colombo' }

  it('lists every linked club, sorted', () => {
    expect(eventClubsLabel(linked('a', 'b'), names)).toBe('Colombo, Kandy')
  })

  it('says "All clubs" for an all-club event, and skips unknown clubs', () => {
    expect(eventClubsLabel(allClubs, names)).toBe(ALL_CLUBS_LABEL)
    expect(eventClubsLabel(linked('a', 'gone'), names)).toBe('Kandy')
  })
})

describe('readClubChoice', () => {
  it('reads "selected" with every ticked club once, ignoring blanks', () => {
    const form = new FormData()
    form.set('club_scope', 'selected')
    for (const v of ['a', 'b', 'a', ' ']) form.append('club_ids', v)
    expect(readClubChoice(form)).toEqual({ allClubs: false, clubIds: ['a', 'b'] })
  })

  it('reads "all clubs" and drops any club ids sent with it', () => {
    const form = new FormData()
    form.set('club_scope', 'all')
    form.append('club_ids', 'a')
    expect(readClubChoice(form)).toEqual({ allClubs: true, clubIds: [] })
  })
})

describe('checkClubChoice', () => {
  const superAdmin = { id: 'sa', role: 'super_admin', club_id: null }
  const champion = { id: 'ch', role: 'champion', club_id: 'own' }
  const active = new Set(['own', 'a', 'b'])

  it('Super Admin: all clubs, one club or several active clubs', () => {
    expect(checkClubChoice(superAdmin, { allClubs: true, clubIds: [] }, active)).toBeNull()
    expect(checkClubChoice(superAdmin, { allClubs: false, clubIds: ['a'] }, active)).toBeNull()
    expect(checkClubChoice(superAdmin, { allClubs: false, clubIds: ['a', 'b'] }, active)).toBeNull()
  })

  it('Super Admin: must pick at least one club when not "all clubs"', () => {
    expect(checkClubChoice(superAdmin, { allClubs: false, clubIds: [] }, active)).toBe(MSG_PICK_A_CLUB)
  })

  it('Super Admin: an inactive club can be kept on an event, not newly picked', () => {
    expect(checkClubChoice(superAdmin, { allClubs: false, clubIds: ['old'] }, active)).toMatch(/inactive/)
    expect(checkClubChoice(superAdmin, { allClubs: false, clubIds: ['old', 'a'] }, active, ['old'])).toBeNull()
  })

  it('Champion: only exactly their own club', () => {
    expect(checkClubChoice(champion, { allClubs: false, clubIds: ['own'] }, active)).toBeNull()
    expect(checkClubChoice(champion, { allClubs: false, clubIds: ['a'] }, active)).toBe(MSG_OWN_CLUB_ONLY)
    expect(checkClubChoice(champion, { allClubs: false, clubIds: ['own', 'a'] }, active)).toBe(MSG_OWN_CLUB_ONLY)
    expect(checkClubChoice(champion, { allClubs: true, clubIds: [] }, active)).toBe(MSG_OWN_CLUB_ONLY)
    expect(checkClubChoice(champion, { allClubs: false, clubIds: [] }, active)).toBe(MSG_OWN_CLUB_ONLY)
  })

  it('anyone else is refused', () => {
    expect(checkClubChoice({ id: 'g', role: 'gatekeeper', club_id: 'own' }, { allClubs: false, clubIds: ['own'] }, active)).toBe('Not authorized.')
  })
})

describe('canManageEvent', () => {
  const champion = { id: 'ch', role: 'champion', club_id: 'own' }
  const own = (extra: object) => ({ created_by: 'ch', ...linked('own'), ...extra })

  it('Super Admin: any event', () => {
    const sa = { id: 'sa', role: 'super_admin', club_id: null }
    expect(canManageEvent(sa, { created_by: 'ch', ...linked('own') })).toBe(true)
    expect(canManageEvent(sa, { created_by: 'x', ...allClubs })).toBe(true)
  })

  it('Champion: an event they created for their own club alone', () => {
    expect(canManageEvent(champion, own({}))).toBe(true)
  })

  it('Champion: not all-club, multi-club, other-club or someone else\'s events', () => {
    expect(canManageEvent(champion, { created_by: 'ch', ...allClubs })).toBe(false)
    expect(canManageEvent(champion, { created_by: 'ch', ...linked('own', 'a') })).toBe(false)
    expect(canManageEvent(champion, { created_by: 'ch', ...linked('a') })).toBe(false)
    expect(canManageEvent(champion, { created_by: 'someone-else', ...linked('own') })).toBe(false)
  })
})
