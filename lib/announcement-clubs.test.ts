import { describe, expect, it } from 'vitest'
import { MSG_PICK_A_CLUB, announcementClubsLabel, resolveAnnouncementScope } from '@/lib/announcement-clubs'

const superAdmin = { role: 'super_admin', club_id: null }
const champion = { role: 'champion', club_id: 'own' }
const active = new Set(['own', 'a', 'b'])
const selected = (...clubIds: string[]) => ({ allClubs: false, clubIds })
const allClubs = { allClubs: true, clubIds: [] }

describe('resolveAnnouncementScope', () => {
  it('Super Admin: Specific Cohort for one club, several clubs, or all clubs', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('a'), active)).toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['a'] })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('a', 'b'), active)).toEqual({ audience: 'specific_clubs', allClubs: false, clubIds: ['a', 'b'] })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', allClubs, active)).toEqual({ audience: 'specific_clubs', allClubs: true, clubIds: [] })
  })

  it('Super Admin: Specific Cohort needs at least one club', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected(), active)).toEqual({ error: MSG_PICK_A_CLUB })
  })

  it('Super Admin: other audiences never carry clubs', () => {
    expect(resolveAnnouncementScope(superAdmin, 'gatekeepers', selected('a'), active)).toEqual({ audience: 'gatekeepers', allClubs: false, clubIds: [] })
    expect(resolveAnnouncementScope(superAdmin, 'all', allClubs, active)).toEqual({ audience: 'all', allClubs: false, clubIds: [] })
  })

  it('Super Admin: an inactive club can be kept, not newly picked', () => {
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('old'), active)).toMatchObject({ error: expect.stringMatching(/inactive/) })
    expect(resolveAnnouncementScope(superAdmin, 'specific_clubs', selected('old', 'a'), active, ['old'])).toMatchObject({ clubIds: ['old', 'a'] })
  })

  it('Champion: always their own club, whatever was sent', () => {
    const own = { audience: 'specific_clubs', allClubs: false, clubIds: ['own'] }
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
