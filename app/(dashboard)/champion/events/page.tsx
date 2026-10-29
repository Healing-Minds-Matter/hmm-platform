import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EventsCalendar } from '@/app/(dashboard)/super-admin/events/events-calendar'
import { monthGridRange, weekRange } from '@/app/(dashboard)/super-admin/events/date-grid'
import { fromOrgWallClock, toOrgWallClock } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, eventClubsLabel, isEventForClub } from '@/lib/event-clubs'

export const metadata = { title: 'Events & Calendar — HMM Champion' }

export default async function ChampionEventsPage({
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
  const month = sp.month ? parseInt(sp.month, 10) : todayWall.getUTCMonth() + 1
  const day = sp.day ? parseInt(sp.day, 10) : todayWall.getUTCDate()
  const clubFilter = sp.club || ''
  const typeFilter = sp.type || ''
  const q = sp.q || ''
  const selectedEventId = sp.event || ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('club_id').eq('id', user.id).single()
  if (!profile?.club_id) redirect('/champion')

  // Champions may only read their own club (RLS), but an event can be
  // linked to other clubs too — their names are needed to show it and to
  // filter by club. Only id + name, read with the admin client (the same
  // names event_details_extra already shares with Gatekeepers).
  const { data: clubs } = await createAdminClient().from('clubs').select('id, name').order('name')
  const clubNameById = Object.fromEntries((clubs ?? []).map(c => [c.id, c.name]))

  const EVENT_COLUMNS = `id, title, type, starts_at, ends_at, venue, description, max_participants, created_by, facilitator, virtual_link, ${EVENT_CLUBS_EMBED}`

  // Shared platform-wide calendar (Story 6.1: "not limited to their own
  // club") — same read-all scope as Super Admin, just a different basePath
  // and edit/cancel only on events this Champion created.
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
  if (typeFilter) eventsQuery = eventsQuery.eq('type', typeFilter)
  if (q) eventsQuery = eventsQuery.or(`title.ilike.%${q}%,venue.ilike.%${q}%`)

  const [{ data: events }, { data: allForCounts }] = await Promise.all([
    eventsQuery,
    supabase.from('events').select('type').eq('is_cancelled', false),
  ])

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
    if (data) selectedEvent = { ...data, club_name: eventClubsLabel(data, clubNameById) }
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
      upcomingQpr={[]}
      upcomingQprTotal={0}
      basePath="/champion/events"
      manageUserId={user.id}
    />
  )
}
