// An event belongs to no club, one club or several (public.event_clubs —
// see migration 20261029000000_event_multiple_clubs). No clubs means it
// isn't tied to a club: it's open to all clubs, so it counts as an event
// "for" every club.

// Add to an events select() to get the event's clubs.
export const EVENT_CLUBS_EMBED = 'event_clubs(club_id)'

export type WithEventClubs = { event_clubs?: { club_id: string }[] | null }

export function eventClubIds(event: WithEventClubs): string[] {
  return (event.event_clubs ?? []).map(link => link.club_id)
}

// Is this event for the given club(s)? True for events open to all clubs.
export function isEventForClub(event: WithEventClubs, clubIds: string | Iterable<string>): boolean {
  const ids = eventClubIds(event)
  if (ids.length === 0) return true
  const wanted = new Set(typeof clubIds === 'string' ? [clubIds] : clubIds)
  return ids.some(id => wanted.has(id))
}

export const ALL_CLUBS_LABEL = 'All clubs'

// Clubs missing from nameById (e.g. inactive ones on a dashboard that only
// loads active clubs) are left out.
export function eventClubsLabel(event: WithEventClubs, nameById: Record<string, string>): string {
  const ids = eventClubIds(event)
  if (ids.length === 0) return ALL_CLUBS_LABEL
  const names = ids.flatMap(id => (nameById[id] ? [nameById[id]] : [])).sort((a, b) => a.localeCompare(b))
  return names.length ? names.join(', ') : '—'
}

// The form posts one club_ids field per ticked club.
export function readClubIds(formData: FormData): string[] {
  return [...new Set(formData.getAll('club_ids').map(v => String(v).trim()).filter(Boolean))]
}
