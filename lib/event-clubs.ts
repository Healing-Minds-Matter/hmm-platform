// An event is either for all clubs (events.is_all_clubs) or for one or more
// clubs (public.event_clubs) — see migrations 20261029000000 and
// 20261030000000. Pure helpers, shared by the pages and the server actions.

// Add to an events select() to get the event's clubs.
export const EVENT_CLUBS_EMBED = 'is_all_clubs, event_clubs(club_id)'

export type WithEventClubs = {
  is_all_clubs?: boolean | null
  event_clubs?: { club_id: string }[] | null
}

export function eventClubIds(event: WithEventClubs): string[] {
  return (event.event_clubs ?? []).map(link => link.club_id)
}

// Is this event for the given club(s)? True for all-club events.
export function isEventForClub(event: WithEventClubs, clubIds: string | Iterable<string>): boolean {
  if (event.is_all_clubs) return true
  const wanted = new Set(typeof clubIds === 'string' ? [clubIds] : clubIds)
  return eventClubIds(event).some(id => wanted.has(id))
}

export const ALL_CLUBS_LABEL = 'All clubs'

// Clubs missing from nameById (e.g. inactive ones on a dashboard that only
// loads active clubs) are left out.
export function eventClubsLabel(event: WithEventClubs, nameById: Record<string, string>): string {
  if (event.is_all_clubs) return ALL_CLUBS_LABEL
  const names = eventClubIds(event).flatMap(id => (nameById[id] ? [nameById[id]] : [])).sort((a, b) => a.localeCompare(b))
  return names.length ? names.join(', ') : '—'
}

// ── Who may do what ─────────────────────────────────────────────────────────
// The database enforces the same rules (RLS + save_event); these give the
// screens and the server actions a readable answer first.

export type EventCaller = { id: string; role: string | null; club_id: string | null }

// Super Admin: any event. Champion: only an event they created that is for
// their own club alone.
export function canManageEvent(caller: EventCaller, event: WithEventClubs & { created_by: string }): boolean {
  if (caller.role === 'super_admin') return true
  if (caller.role !== 'champion' || !caller.club_id) return false
  const ids = eventClubIds(event)
  return event.created_by === caller.id && !event.is_all_clubs && ids.length === 1 && ids[0] === caller.club_id
}

// What the form asked for: all clubs, or these clubs.
export type ClubChoice = { allClubs: boolean; clubIds: string[] }

export function readClubChoice(formData: FormData): ClubChoice {
  const allClubs = formData.get('club_scope') === 'all'
  const clubIds = [...new Set(formData.getAll('club_ids').map(v => String(v).trim()).filter(Boolean))]
  return { allClubs, clubIds: allClubs ? [] : clubIds }
}

export const MSG_PICK_A_CLUB = 'Please choose at least one club.'
export const MSG_OWN_CLUB_ONLY = 'You can only schedule events for your own club.'
export const MSG_CANT_MANAGE = 'You can only edit or cancel events you created for your own club.'

// Checks the club choice for the caller's role. activeClubIds: clubs that
// may be newly selected; keptClubIds: clubs the event is already linked to
// (allowed even if they've since become inactive).
export function checkClubChoice(
  caller: EventCaller,
  choice: ClubChoice,
  activeClubIds: Set<string>,
  keptClubIds: string[] = []
): string | null {
  if (caller.role === 'champion') {
    if (!caller.club_id) return 'Your account has no assigned club.'
    const ok = !choice.allClubs && choice.clubIds.length === 1 && choice.clubIds[0] === caller.club_id
    return ok ? null : MSG_OWN_CLUB_ONLY
  }
  if (caller.role !== 'super_admin') return 'Not authorized.'
  if (choice.allClubs) return null
  if (choice.clubIds.length === 0) return MSG_PICK_A_CLUB
  const kept = new Set(keptClubIds)
  const bad = choice.clubIds.find(id => !activeClubIds.has(id) && !kept.has(id))
  return bad ? 'One of the selected clubs is inactive or no longer exists. Please choose active clubs only.' : null
}
