import { createClient } from '@/lib/supabase/server'
import { EventsCalendar } from './events-calendar'
import { CERTIFICATION_PROGRAMME_EVENT } from './event-type'
import { parseCalendarView, viewRange } from './date-grid'
import { fromOrgWallClock, toOrgWallClock } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, eventClubsLabel, isEventForClub } from '@/lib/event-clubs'

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; year?: string; month?: string; day?: string; club?: string; type?: string; q?: string; event?: string }>
}) {
  const sp = await searchParams
  const view = parseCalendarView(sp.view)
  const now = new Date()
  // The calendar works in Sri Lanka dates ("wall-clock" Dates, see lib/org-date.ts).
  const todayWall = toOrgWallClock(now)
  const year = sp.year ? parseInt(sp.year, 10) : todayWall.getUTCFullYear()
  const month = sp.month ? parseInt(sp.month, 10) : todayWall.getUTCMonth() + 1 // 1-12
  const day = sp.day ? parseInt(sp.day, 10) : todayWall.getUTCDate()
  const clubFilter = sp.club || ''
  const typeFilter = sp.type || ''
  const q = sp.q || ''
  const selectedEventId = sp.event || ''

  const supabase = await createClient()

  const { data: clubs } = await supabase.from('clubs').select('id, name').order('name')
  const clubNameById = Object.fromEntries((clubs ?? []).map(c => [c.id, c.name]))

  const EVENT_COLUMNS = `id, title, type, type_description, starts_at, ends_at, venue, description, max_participants, created_by, facilitator, virtual_link, ${EVENT_CLUBS_EMBED}`

  let eventsQuery = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })

  // The days the chosen view covers (Year, Quarter, Month, Week); Agenda has no limit.
  // Grid days are Sri Lanka days: convert their wall-clock midnights to real moments.
  const range = viewRange(view, year, month, day)
  if (range) {
    eventsQuery = eventsQuery.gte('starts_at', fromOrgWallClock(range.start).toISOString()).lt('starts_at', fromOrgWallClock(range.endExclusive).toISOString())
  }
  if (typeFilter) eventsQuery = eventsQuery.eq('type', typeFilter)
  if (q) eventsQuery = eventsQuery.or(`title.ilike.%${q}%,venue.ilike.%${q}%`)

  const [{ data: events }, { data: allForCounts }, { data: upcomingProgrammes, count: upcomingProgrammesCount }] = await Promise.all([
    eventsQuery,
    supabase.from('events').select('type').eq('is_cancelled', false),
    supabase
      .from('events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .eq('type', CERTIFICATION_PROGRAMME_EVENT)
      .eq('is_cancelled', false)
      .gt('starts_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(4),
  ])

  const upcomingProgrammesWithClub = (upcomingProgrammes ?? []).map(e => ({ ...e, club_name: eventClubsLabel(e, clubNameById) }))

  // Club filter: events linked to that club, plus events open to all clubs.
  const eventsWithClub = (events ?? [])
    .filter(e => !clubFilter || isEventForClub(e, clubFilter))
    .map(e => ({ ...e, club_name: eventClubsLabel(e, clubNameById) }))

  const typeCounts: Record<string, number> = {}
  for (const e of allForCounts ?? []) typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1

  let selectedEvent = null
  if (selectedEventId) {
    const { data } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('id', selectedEventId)
      .maybeSingle()
    // Super Admins may edit and cancel any event.
    if (data) {
      // Sheet row 66: everyone who registered (Super Admins see all).
      const { data: registrants } = await supabase.rpc('event_registrants', { p_event_id: data.id })
      selectedEvent = { ...data, club_name: eventClubsLabel(data, clubNameById), can_manage: true, registrants: registrants ?? [], registrantsScope: 'all' as const }
    }
  }

  return (
    <EventsCalendar
      view={view}
      year={year}
      month={month}
      day={day}
      club={clubFilter}
      type={typeFilter}
      q={q}
      events={eventsWithClub}
      clubs={clubs ?? []}
      typeCounts={typeCounts}
      totalCount={(allForCounts ?? []).length}
      selectedEvent={selectedEvent}
      generatedAt={now.toISOString()}
      upcomingProgrammes={upcomingProgrammesWithClub}
      upcomingProgrammesTotal={upcomingProgrammesCount ?? 0}
    />
  )
}
