import { describe, expect, it } from 'vitest'
import { ALL_CLUBS_LABEL, eventClubIds, eventClubsLabel, isEventForClub, readClubIds } from '@/lib/event-clubs'

const linked = (...ids: string[]) => ({ event_clubs: ids.map(club_id => ({ club_id })) })

describe('isEventForClub', () => {
  it('matches an event linked to the club, among several', () => {
    expect(isEventForClub(linked('a', 'b'), 'b')).toBe(true)
    expect(isEventForClub(linked('a', 'b'), ['x', 'a'])).toBe(true)
  })

  it('does not match an event linked only to other clubs', () => {
    expect(isEventForClub(linked('a', 'b'), 'c')).toBe(false)
  })

  it('treats an event with no clubs as open to every club', () => {
    expect(isEventForClub(linked(), 'c')).toBe(true)
    expect(isEventForClub({ event_clubs: null }, 'c')).toBe(true)
    expect(eventClubIds({})).toEqual([])
  })
})

describe('eventClubsLabel', () => {
  const names = { a: 'Kandy', b: 'Colombo' }

  it('lists every linked club, sorted', () => {
    expect(eventClubsLabel(linked('a', 'b'), names)).toBe('Colombo, Kandy')
  })

  it('says "All clubs" when there are none, and skips unknown clubs', () => {
    expect(eventClubsLabel(linked(), names)).toBe(ALL_CLUBS_LABEL)
    expect(eventClubsLabel(linked('a', 'gone'), names)).toBe('Kandy')
  })
})

describe('readClubIds', () => {
  it('reads every ticked club once, ignoring blanks', () => {
    const form = new FormData()
    for (const v of ['a', 'b', 'a', ' ']) form.append('club_ids', v)
    expect(readClubIds(form)).toEqual(['a', 'b'])
    expect(readClubIds(new FormData())).toEqual([])
  })
})
