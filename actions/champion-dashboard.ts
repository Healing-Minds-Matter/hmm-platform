'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EVENT_CLUBS_EMBED, isEventForClub, type WithEventClubs } from '@/lib/event-clubs'

export type EventSummary = {
  id: string
  title: string
  type: string
  starts_at: string
  ends_at: string | null
  venue: string
  description: string | null
  max_participants: number | null
}

export type NotLoggedInGatekeeper = {
  id: string
  full_name: string
  email: string
  created_at: string
}

export type MonthlyCount = { month: string; count: number }

export type ChampionDashboardData = {
  clubId: string
  clubName: string
  activeGatekeepers: number
  inactiveGatekeepers: number
  newGatekeepersThisMonth: number
  qpr: { certified: number; total: number; expiringSoon: number }
  monthlyTrend: MonthlyCount[]
  notYetLoggedIn: NotLoggedInGatekeeper[]
  upcomingEvents: EventSummary[]
  recentlyCompleted: EventSummary[]
}

const EMPTY: ChampionDashboardData = {
  clubId: '',
  clubName: '',
  activeGatekeepers: 0,
  inactiveGatekeepers: 0,
  newGatekeepersThisMonth: 0,
  qpr: { certified: 0, total: 0, expiringSoon: 0 },
  monthlyTrend: [],
  notYetLoggedIn: [],
  upcomingEvents: [],
  recentlyCompleted: [],
}

// Matches the >90-day "expiring soon" convention already established
// elsewhere in the app (Club/Champion detail, Super Admin QPR widget).
const EXPIRING_SOON_DAYS = 90

export async function getChampionDashboardData(): Promise<ChampionDashboardData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('id', user.id)
    .single()

  if (!profile?.club_id) return EMPTY

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('id', profile.club_id)
    .single()

  if (!club) return EMPTY

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const soonCutoff = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const [
    { count: activeGatekeepers },
    { count: inactiveGatekeepers },
    { count: newThisMonth },
    { data: qprProfiles },
    { data: trendRows },
    { data: gatekeeperRows },
    { data: upcomingRows },
    { data: completedRows },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('club_id', club.id).eq('role', 'gatekeeper').eq('is_active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('club_id', club.id).eq('role', 'gatekeeper').eq('is_active', false),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('club_id', club.id).eq('role', 'gatekeeper').gte('created_at', monthStart),
    supabase.from('profiles').select('qpr_certification_date, qpr_expiry_date')
      .eq('club_id', club.id).in('role', ['gatekeeper', 'champion']),
    supabase.from('profiles').select('created_at')
      .eq('club_id', club.id).eq('role', 'gatekeeper').gte('created_at', sixMonthsAgo),
    supabase.from('profiles').select('id, full_name, email, created_at')
      .eq('club_id', club.id).eq('role', 'gatekeeper').eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase.from('events').select(`id, title, type, starts_at, ends_at, venue, description, max_participants, ${EVENT_CLUBS_EMBED}`)
      .eq('is_cancelled', false)
      .gte('starts_at', now.toISOString()).lte('starts_at', twoWeeksOut)
      .order('starts_at', { ascending: true }),
    supabase.from('events').select(`id, title, type, starts_at, ends_at, venue, description, max_participants, ${EVENT_CLUBS_EMBED}`)
      .eq('is_cancelled', false)
      .lt('starts_at', now.toISOString()).gte('starts_at', thirtyDaysAgo)
      .order('starts_at', { ascending: false }),
  ])

  // This club's events plus events open to all clubs, without the clubs list.
  const forClub = (rows: (EventSummary & WithEventClubs)[] | null): EventSummary[] =>
    (rows ?? []).filter(e => isEventForClub(e, club.id)).map(({ event_clubs: _clubs, ...e }) => e)

  const total = qprProfiles?.length ?? 0
  const certified = (qprProfiles ?? []).filter(p => p.qpr_expiry_date && p.qpr_expiry_date > now.toISOString()).length
  const expiringSoon = (qprProfiles ?? []).filter(
    p => p.qpr_expiry_date && p.qpr_expiry_date > now.toISOString() && p.qpr_expiry_date <= soonCutoff
  ).length

  const monthBuckets: MonthlyCount[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    const count = (trendRows ?? []).filter(r => {
      const rd = new Date(r.created_at)
      return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth()
    }).length
    monthBuckets.push({ month: label, count })
  }

  // "Added but not yet logged in" (Champion dashboard requirement) — real,
  // not fabricated: Supabase Auth natively tracks last_sign_in_at on every
  // invited user, so this reads true never-logged-in status even though no
  // Gatekeeper mobile app exists yet to log in from.
  let notYetLoggedIn: NotLoggedInGatekeeper[] = []
  if (gatekeeperRows && gatekeeperRows.length > 0) {
    const admin = createAdminClient()
    const results = await Promise.all(
      gatekeeperRows.map(async g => {
        const { data } = await admin.auth.admin.getUserById(g.id)
        return data.user?.last_sign_in_at ? null : g
      })
    )
    notYetLoggedIn = results.filter((g): g is NotLoggedInGatekeeper => g !== null)
  }

  return {
    clubId: club.id,
    clubName: club.name,
    activeGatekeepers: activeGatekeepers ?? 0,
    inactiveGatekeepers: inactiveGatekeepers ?? 0,
    newGatekeepersThisMonth: newThisMonth ?? 0,
    qpr: { certified, total, expiringSoon },
    monthlyTrend: monthBuckets,
    notYetLoggedIn,
    upcomingEvents: forClub(upcomingRows),
    recentlyCompleted: forClub(completedRows),
  }
}
