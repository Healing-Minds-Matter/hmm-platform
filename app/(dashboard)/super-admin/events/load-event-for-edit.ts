import { createClient } from '@/lib/supabase/server'
// Pre-fills the form in Sri Lanka time, the same zone it is saved in.
import { isoToOrgDateTime } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, canManageEvent, eventClubIds } from '@/lib/event-clubs'
import type { EventValues } from './edit-event-form'
import type { ClubOption } from './event-clubs-field'

export type EditEventProps = {
  event: EventValues
  clubs?: ClubOption[]
  ownClub?: { id: string; name: string }
  fallbackPath: string
}

// Everything the edit form needs, for both portals — or null when the
// event doesn't exist, is cancelled, or the caller may not edit it (a
// Champion: only events they created for their own club alone; RLS
// enforces the same on save).
export async function loadEventForEdit(id: string, userId: string): Promise<EditEventProps | null> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id, clubs!profiles_club_id_fkey(id, name)')
    .eq('id', userId)
    .single()
  if (!profile) return null

  const { data: event } = await supabase
    .from('events')
    .select(`id, title, type, starts_at, ends_at, venue, description, max_participants, facilitator, virtual_link, created_by, is_cancelled, ${EVENT_CLUBS_EMBED}`)
    .eq('id', id)
    .maybeSingle()
  if (!event || event.is_cancelled) return null
  if (!canManageEvent({ id: userId, role: profile.role, club_id: profile.club_id }, event)) return null

  const { date, time: start_time } = isoToOrgDateTime(event.starts_at)
  const values: EventValues = {
    id: event.id,
    title: event.title,
    type: event.type,
    event_date: date,
    start_time,
    end_time: event.ends_at ? isoToOrgDateTime(event.ends_at).time : '',
    venue: event.venue,
    facilitator: event.facilitator ?? '',
    virtual_link: event.virtual_link ?? '',
    max_participants: event.max_participants ? String(event.max_participants) : '',
    description: event.description ?? '',
    is_all_clubs: !!event.is_all_clubs,
    club_ids: eventClubIds(event),
  }

  if (profile.role === 'champion') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const club = profile.clubs as any
    return { event: values, ownClub: { id: club.id, name: club.name }, fallbackPath: '/champion/events' }
  }

  // Super Admin: active clubs, plus any inactive club the event is already
  // linked to (it may be kept, but not newly picked).
  const { data: allClubs } = await supabase.from('clubs').select('id, name, is_active').order('name')
  const linked = new Set(values.club_ids)
  const clubs = (allClubs ?? [])
    .filter(c => c.is_active || linked.has(c.id))
    .map(c => ({ id: c.id, name: c.name, inactive: !c.is_active }))
  return { event: values, clubs, fallbackPath: '/super-admin/events' }
}
