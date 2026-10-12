import { createClient } from '@/lib/supabase/server'
import { EventsCalendar } from './events-calendar'
import { monthGridRange, weekRange } from './date-grid'
import { fromOrgWallClock, toOrgWallClock } from '@/lib/org-date'

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; year?: string; month?: string; day?: string; club?: string; type?: string; q?: string; event?: string }>
}) {
  const sp = await searchParams
  const view: 'month' | 'week' | 'agenda' = sp.view === 'week' ? 'week' : sp.view === 'agenda' ? 'agenda' : 'month'
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

  const EVENT_COLUMNS = 'id, title, type, starts_at, ends_at, venue, description, max_participants, club_id, facilitator, virtual_link'

  let eventsQuery = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })

  if (view === 'month') {
    const { gridStart, gridEnd } = monthGridRange(year, month)
    const gridEndExclusive = new Date(gridEnd)
    gridEndExclusive.setUTCDate(gridEndExclusive.getUTCDate() + 1)
    // Grid days are Sri Lanka days: convert their wall-clock midnights to real moments.
    eventsQuery = eventsQuery.gte('starts_at', fromOrgWallClock(gridStart).toISOString()).lt('starts_at', fromOrgWallClock(gridEndExclusive).toISOString())
  } else if (view === 'week') {
    const { start, end } = weekRange(new Date(Date.UTC(year, month - 1, day)))
    const endExclusive = new Date(end)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    eventsQuery = eventsQuery.gte('starts_at', fromOrgWallClock(start).toISOString()).lt('starts_at', fromOrgWallClock(endExclusive).toISOString())
  }
  if (clubFilter) eventsQuery = eventsQuery.eq('club_id', clubFilter)
  if (typeFilter) eventsQuery = eventsQuery.eq('type', typeFilter)
  if (q) eventsQuery = eventsQuery.or(`title.ilike.%${q}%,venue.ilike.%${q}%`)

  const [{ data: events }, { data: allForCounts }, { data: upcomingQpr, count: upcomingQprCount }] = await Promise.all([
    eventsQuery,
    supabase.from('events').select('type').eq('is_cancelled', false),
    supabase
      .from('events')
      .select(EVENT_COLUMNS, { count: 'exact' })
      .eq('type', 'qpr_session')
      .eq('is_cancelled', false)
      .gt('starts_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(4),
  ])

  const upcomingQprWithClub = (upcomingQpr ?? []).map(e => ({ ...e, club_name: clubNameById[e.club_id] ?? '—' }))

  const eventsWithClub = (events ?? []).map(e => ({ ...e, club_name: clubNameById[e.club_id] ?? '—' }))

  const typeCounts: Record<string, number> = {}
  for (const e of allForCounts ?? []) typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1

  let selectedEvent = null
  if (selectedEventId) {
    const { data } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('id', selectedEventId)
      .maybeSingle()
    if (data) selectedEvent = { ...data, club_name: clubNameById[data.club_id] ?? '—' }
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
      upcomingQpr={upcomingQprWithClub}
      upcomingQprTotal={upcomingQprCount ?? 0}
    />
  )
}
