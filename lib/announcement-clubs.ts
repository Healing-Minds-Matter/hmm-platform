// Which clubs an announcement is for — migration 20261031000000. Audience
// "Specific Cohort" (specific_clubs) is either all clubs (is_all_clubs) or
// one or more clubs (announcement_clubs rows). Other audiences have no clubs.
// Pure helpers, shared by the pages and the server actions.

import type { ClubChoice } from '@/lib/event-clubs'

// Add to an announcements select() to get its clubs.
export const ANNOUNCEMENT_CLUBS_EMBED = 'is_all_clubs, announcement_clubs(club_id)'

export type WithAnnouncementClubs = {
  is_all_clubs?: boolean | null
  announcement_clubs?: { club_id: string }[] | null
}

export function announcementClubIds(a: WithAnnouncementClubs): string[] {
  return (a.announcement_clubs ?? []).map(link => link.club_id)
}

// For "Specific Cohort": "All clubs" or the clubs' names; null otherwise.
export function announcementClubsLabel(a: WithAnnouncementClubs & { audience: string }, nameById: Record<string, string>): string | null {
  if (a.audience !== 'specific_clubs') return null
  if (a.is_all_clubs) return 'All clubs'
  const names = announcementClubIds(a).flatMap(id => (nameById[id] ? [nameById[id]] : [])).sort((x, y) => x.localeCompare(y))
  return names.length ? names.join(', ') : null
}

export const MSG_PICK_A_CLUB = 'Please choose at least one club.'
export const MSG_OWN_CLUB_ONLY = 'You can only post announcements to your own club.'

export type AnnouncementScope = { audience: string; allClubs: boolean; clubIds: string[] }

// What gets saved, by role. Super Admin: any audience; "Specific Cohort"
// needs "All clubs" or at least one active club (a club the announcement is
// already linked to may be kept even if it has since become inactive).
// Champion: always their own club — their form has no audience or club
// picker, and anything else sent is ignored.
export function resolveAnnouncementScope(
  caller: { role: string | null; club_id: string | null },
  audience: string,
  choice: ClubChoice,
  activeClubIds: Set<string>,
  keptClubIds: string[] = []
): AnnouncementScope | { error: string } {
  if (caller.role === 'champion') {
    if (!caller.club_id) return { error: 'Your account has no assigned club.' }
    return { audience: 'specific_clubs', allClubs: false, clubIds: [caller.club_id] }
  }
  if (caller.role !== 'super_admin') return { error: 'Not authorized.' }
  if (audience !== 'specific_clubs') return { audience, allClubs: false, clubIds: [] }
  if (choice.allClubs) return { audience, allClubs: true, clubIds: [] }
  if (choice.clubIds.length === 0) return { error: MSG_PICK_A_CLUB }
  const kept = new Set(keptClubIds)
  if (choice.clubIds.some(id => !activeClubIds.has(id) && !kept.has(id))) {
    return { error: 'One of the selected clubs is inactive or no longer exists. Please choose active clubs only.' }
  }
  return { audience, allClubs: false, clubIds: choice.clubIds }
}
