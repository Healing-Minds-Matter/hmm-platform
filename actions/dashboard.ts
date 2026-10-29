'use server'

import { createClient } from '@/lib/supabase/server'
import { EVENT_CLUBS_EMBED, eventClubsLabel, isEventForClub } from '@/lib/event-clubs'

export type BarItem = { club_id: string; club_name: string; count: number; club_location?: string | null }
export type StackedItem = { club_id: string; club_name: string; active: number; inactive: number }
export type UpcomingEvent = { id: string; title: string; club_name: string; starts_at: string; type: string }
export type EventsData = { total: number; events: UpcomingEvent[] }
export type QPRData = { certified: number; total: number; expiringSoon: number }
export type OnboardingFilter = 'this_month' | 'last_month' | 'this_quarter'
export type EventsFilter = 'next_7_days' | 'next_30_days' | 'all_upcoming'

export type DashboardData = {
  activeGatekeepersPerClub: BarItem[]
  totalActiveChampions: number
  onboardingProgress: BarItem[]
  onboardingMomChangePct: number | null
  gatekeeperStatusPerClub: StackedItem[]
  upcomingEvents: EventsData
  qprData: QPRData
}

const EMPTY: DashboardData = {
  activeGatekeepersPerClub: [],
  totalActiveChampions: 0,
  onboardingProgress: [],
  onboardingMomChangePct: null,
  gatekeeperStatusPerClub: [],
  upcomingEvents: { total: 0, events: [] },
  qprData: { certified: 0, total: 0, expiringSoon: 0 },
}

// Period boundaries for an onboarding filter, plus the immediately-preceding
// period of the same length — used to compute the real "+N% vs last month"
// comparison. "Current" periods (this_month/this_quarter) run to now, not to
// the calendar period's end, since they're still in progress.
function getPeriodBounds(filter: OnboardingFilter, now: Date) {
  if (filter === 'last_month') {
    const currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const currentEnd = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const prevEnd = currentStart
    return { currentStart, currentEnd, prevStart, prevEnd }
  }
  if (filter === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const currentStart = new Date(now.getFullYear(), q * 3, 1)
    const prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1)
    const prevEnd = currentStart
    return { currentStart, currentEnd: null, prevStart, prevEnd }
  }
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd = currentStart
  return { currentStart, currentEnd: null, prevStart, prevEnd }
}

// null when the prior period had zero onboardings — a percentage change from
// zero isn't a meaningful real number, so the callout is omitted rather than
// showing a fabricated/misleading value (e.g. "+∞%" or "+100%").
function momChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient()

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, location')
    .eq('is_active', true)

  const activeClubs = clubs ?? []
  const clubIds = activeClubs.map(c => c.id)
  if (!clubIds.length) return EMPTY

  const nameById = Object.fromEntries(activeClubs.map(c => [c.id, c.name]))

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const today = now.toISOString().split('T')[0]
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: allGk },
    { count: champCount },
    { data: newGk },
    { count: lastMonthGkCount },
    { data: events },
    { data: certUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('club_id, is_active').eq('role', 'gatekeeper').in('club_id', clubIds),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'champion').eq('is_active', true).in('club_id', clubIds),
    supabase.from('profiles').select('club_id').eq('role', 'gatekeeper').in('club_id', clubIds).gte('created_at', thisMonthStart),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'gatekeeper').in('club_id', clubIds).gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
    supabase.from('events').select(`id, title, starts_at, type, ${EVENT_CLUBS_EMBED}`).gt('starts_at', now.toISOString()).eq('is_cancelled', false).order('starts_at', { ascending: true }).lte('starts_at', in30Days),
    supabase.from('profiles').select('qpr_expiry_date').in('role', ['champion', 'gatekeeper']).eq('is_active', true).in('club_id', clubIds),
  ])

  const activeGkByClub: Record<string, number> = {}
  const inactiveGkByClub: Record<string, number> = {}
  for (const gk of allGk ?? []) {
    if (!gk.club_id) continue
    if (gk.is_active) activeGkByClub[gk.club_id] = (activeGkByClub[gk.club_id] ?? 0) + 1
    else inactiveGkByClub[gk.club_id] = (inactiveGkByClub[gk.club_id] ?? 0) + 1
  }

  const newGkByClub: Record<string, number> = {}
  for (const gk of newGk ?? []) {
    if (gk.club_id) newGkByClub[gk.club_id] = (newGkByClub[gk.club_id] ?? 0) + 1
  }

  const allCertUsers = certUsers ?? []
  // Events for an active club, or open to all clubs.
  const eventList = (events ?? []).filter(e => isEventForClub(e, clubIds))

  return {
    activeGatekeepersPerClub: activeClubs
      .map(c => ({ club_id: c.id, club_name: c.name, club_location: c.location, count: activeGkByClub[c.id] ?? 0 }))
      .sort((a, b) => b.count - a.count),

    totalActiveChampions: champCount ?? 0,

    onboardingProgress: activeClubs
      .map(c => ({ club_id: c.id, club_name: c.name, count: newGkByClub[c.id] ?? 0 }))
      .sort((a, b) => b.count - a.count),

    onboardingMomChangePct: momChange((newGk ?? []).length, lastMonthGkCount ?? 0),

    gatekeeperStatusPerClub: activeClubs
      .map(c => ({
        club_id: c.id,
        club_name: c.name,
        active: activeGkByClub[c.id] ?? 0,
        inactive: inactiveGkByClub[c.id] ?? 0,
      }))
      .sort((a, b) => (b.active + b.inactive) - (a.active + a.inactive)),

    upcomingEvents: {
      total: eventList.length,
      events: eventList.slice(0, 3).map(e => ({
        id: e.id,
        title: e.title,
        club_name: eventClubsLabel(e, nameById),
        starts_at: e.starts_at,
        type: e.type,
      })),
    },

    qprData: {
      certified: allCertUsers.filter(u => u.qpr_expiry_date && u.qpr_expiry_date >= today).length,
      total: allCertUsers.length,
      expiringSoon: allCertUsers.filter(u => u.qpr_expiry_date && u.qpr_expiry_date >= today && u.qpr_expiry_date <= in90Days).length,
    },
  }
}

export type OnboardingProgressResult = { items: BarItem[]; momChangePct: number | null }

export async function getOnboardingProgress(filter: OnboardingFilter): Promise<OnboardingProgressResult> {
  const supabase = await createClient()
  const { data: clubs } = await supabase.from('clubs').select('id, name').eq('is_active', true)
  const activeClubs = clubs ?? []
  if (!activeClubs.length) return { items: [], momChangePct: null }

  const clubIds = activeClubs.map(c => c.id)
  const now = new Date()
  const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodBounds(filter, now)

  let currentQuery = supabase
    .from('profiles')
    .select('club_id')
    .eq('role', 'gatekeeper')
    .in('club_id', clubIds)
    .gte('created_at', currentStart.toISOString())
  if (currentEnd) currentQuery = currentQuery.lt('created_at', currentEnd.toISOString())

  const [{ data: newGk }, { count: prevCount }] = await Promise.all([
    currentQuery,
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'gatekeeper')
      .in('club_id', clubIds)
      .gte('created_at', prevStart.toISOString())
      .lt('created_at', prevEnd.toISOString()),
  ])

  const countByClub: Record<string, number> = {}
  for (const gk of newGk ?? []) {
    if (gk.club_id) countByClub[gk.club_id] = (countByClub[gk.club_id] ?? 0) + 1
  }

  return {
    items: activeClubs
      .map(c => ({ club_id: c.id, club_name: c.name, count: countByClub[c.id] ?? 0 }))
      .sort((a, b) => b.count - a.count),
    momChangePct: momChange((newGk ?? []).length, prevCount ?? 0),
  }
}

export async function getUpcomingEvents(filter: EventsFilter): Promise<EventsData> {
  const supabase = await createClient()
  const { data: clubs } = await supabase.from('clubs').select('id, name').eq('is_active', true)
  const activeClubs = clubs ?? []
  if (!activeClubs.length) return { total: 0, events: [] }

  const clubIds = activeClubs.map(c => c.id)
  const nameById = Object.fromEntries(activeClubs.map(c => [c.id, c.name]))
  const now = new Date()

  let query = supabase
    .from('events')
    .select(`id, title, starts_at, type, ${EVENT_CLUBS_EMBED}`)
    .gt('starts_at', now.toISOString())
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })

  if (filter === 'next_7_days') {
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    query = query.lte('starts_at', end.toISOString())
  } else if (filter === 'next_30_days') {
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    query = query.lte('starts_at', end.toISOString())
  }

  const { data: events } = await query
  // Events for an active club, or open to all clubs.
  const eventList = (events ?? []).filter(e => isEventForClub(e, clubIds))

  return {
    total: eventList.length,
    events: eventList.slice(0, 3).map(e => ({
      id: e.id,
      title: e.title,
      club_name: eventClubsLabel(e, nameById),
      starts_at: e.starts_at,
      type: e.type,
    })),
  }
}
