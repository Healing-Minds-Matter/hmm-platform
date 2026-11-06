import { describe, expect, it } from 'vitest'
import { MSG_PICK_A_CLUB, announcementClubsLabel, readRecipientIds, resolveAnnouncementScope } from '@/lib/announcement-clubs'

const superAdmin = { role: 'super_admin', club_id: null }
const champion = { role: 'champion', club_id: 'own' }
const active = new Set(['own', 'a', 'b'])
const selected = (...clubIds: string[]) => ({ allClubs: false, clubIds })
const allClubs = { allClubs: true, clubIds: [] }

describe('resolveAnnouncementScope', () => {
  it('Super Admin: Specific Cohort for one club, several clubs, or all clubs', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('a'), active)).toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['a'], recipientIds: [] })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('a', 'b'), active)).toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['a', 'b'], recipientIds: [] })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', allClubs, active)).toEqual({ audience: 'specific_clubs', allClubs: true, clubIds: [], recipientIds: [] })
  })

  it('Super Admin: Specific Cohort needs at least one club', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected(), active)).toEqual({ error: MSG_PICK_A_CLUB })
  })

  it('Super Admin: other audiences never carry clubs', () => {
    expect(resolveAnnouncementScope(superAdmin, 'gatekeepers', selected('a'), active)).toEqual({ audience: 'gatekeepers', allClubs: false, clubIds: [], recipientIds: [] })
    expect(resolveAnnouncementScope(superAdmin, 'all', allClubs, active)).toEqual({ audience: 'all', allClubs: false, clubIds: [], recipientIds: [] })
  })

  it('Super Admin: an inactive club can be kept, not newly picked', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('old'), active)).toMatchObject({ error: expect.stringMatching(/inactive/) })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('old', 'a'), active, ['old'])).toMatchObject({ clubIds: ['old', 'a'] })
  })

  it('Champion: always their own club, whatever was sent', () => {
    const own = { audience: 'specific_clubs', allClubs: false, clubIds: ['own'], recipientIds: [] }
    expect(resolveAnnouncementScope(champion, 'all', selected(), active)).toEqual(own)
    expect(resolveAnnouncementScope(champion, 'specific_clubs', selected('a', 'b'), active)).toEqual(own)
    expect(resolveAnnouncementScope(champion, 'specific_clubs', allClubs, active)).toEqual(own)
  })

  it('anyone else is refused', () => {
    expect(resolveAnnouncementScope({ role: 'gatekeeper', club_id: 'own' }, 'all', selected(), active)).toEqual({ error: 'Not authorized.' })
  })
})

describe('announcementClubsLabel', () => {
  const names = { a: 'Kandy', b: 'Colombo' }
  const with_ = (audience: string, extra: object) => ({ audience, ...extra })

  it('lists the clubs of a Specific Cohort announcement, or says All clubs', () => {
    expect(announcementClubsLabel(with_('specific_clubs', { announcement_clubs: [{ club_id: 'a' }, { club_id: 'b' }] }), names)).toBe('Colombo, Kandy')
    expect(announcementClubsLabel(with_('specific_clubs', { is_all_clubs: true }), names)).toBe('All clubs')
  })

  it('has no club label for other audiences', () => {
    expect(announcementClubsLabel(with_('all', { announcement_clubs: [] }), names)).toBeNull()
  })
})

describe('people inside the chosen clubs (sheet row 38)', () => {
  it('keeps the picked people for Specific Cohort clubs, and for a Champion own club', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('a'), active, [], ['p1', 'p2']))
      .toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['a'], recipientIds: ['p1', 'p2'] })
    expect(resolveAnnouncementScope(champion, 'all', selected(), active, [], ['p1']))
      .toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['own'], recipientIds: ['p1'] })
  })
  it('drops people for other audiences and for all clubs', () => {
    expect(resolveAnnouncementScope(superAdmin, 'gatekeepers', selected('a'), active, [], ['p1'])).toMatchObject({ recipientIds: [] })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', allClubs, active, [], ['p1'])).toMatchObject({ recipientIds: [] })
  })
  it('reads each person once', () => {
    const f = new FormData()
    for (const id of ['p1', 'p2', 'p1', ' ']) f.append('recipient_ids', id)
    expect(readRecipientIds(f)).toEqual(['p1', 'p2'])
  })
})
