import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClubStatusToggle } from './club-status-toggle'
import { eventTypeStyle } from '@/app/(dashboard)/super-admin/events/event-type'
// Event dates/times are shown in Sri Lanka time (see lib/org-date.ts).
import { ORG_TIME_ZONE } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, isEventForClub } from '@/lib/event-clubs'

export const metadata = { title: 'Club Details — HMM Super Admin' }

const PAGE_SIZE = 10

type Tab = 'roster' | 'events'

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'qpr_session',       label: 'QPR Certification Session' },
  { value: 'awareness_program', label: 'Awareness Program' },
  { value: 'workshop',          label: 'Workshop' },
  { value: 'other',             label: 'Other' },
]

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ORG_TIME_ZONE })
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ORG_TIME_ZONE })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ORG_TIME_ZONE })
}

function formatTimeRange(startsAt: string, endsAt: string | null) {
  return endsAt ? `${formatTime(startsAt)} – ${formatTime(endsAt)}` : formatTime(startsAt)
}

function KpiCard({
  label, iconSrc, value, caption,
}: {
  label: string
  iconSrc: string
  value: string | number
  caption: string
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-bold text-[#0F172A]">{label}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" width={32} height={32} className="flex-shrink-0" />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-2xl font-bold leading-tight text-[#0F172A]">{value}</p>
        <p className="text-xs leading-tight text-[#64748B]">{caption}</p>
      </div>
    </div>
  )
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; gkQ?: string; evQ?: string; evType?: string; page?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const tab: Tab = sp.tab === 'events' ? 'events' : 'roster'
  const gkQ    = (sp.gkQ ?? '').trim()
  const evQ    = (sp.evQ ?? '').trim()
  const evType = sp.evType ?? ''
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const supabase = await createClient()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, club_code, name, location, description, is_active, created_at')
    .eq('id', id)
    .single()

  if (!club) notFound()

  const [{ data: champions }, { data: gatekeepers }, { data: events }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, is_active, qpr_expiry_date')
      .eq('club_id', id)
      .eq('role', 'champion')
      .order('full_name'),
    supabase
      .from('profiles')
      .select('id, full_name, email, is_active, qpr_expiry_date')
      .eq('club_id', id)
      .eq('role', 'gatekeeper')
      .order('full_name'),
    supabase
      .from('events')
      .select(`id, title, type, starts_at, ends_at, venue, max_participants, is_cancelled, ${EVENT_CLUBS_EMBED}`)
      .eq('is_cancelled', false)
      .order('starts_at', { ascending: true }),
  ])

  const championList   = champions ?? []
  const gatekeeperList = gatekeepers ?? []
  // Events linked to this club, plus events open to all clubs.
  const eventList      = (events ?? []).filter(e => isEventForClub(e, id))

  // ── KPI computations ──────────────────────────────────────────────────────
  const activeGatekeepers   = gatekeeperList.filter(g => g.is_active)
  const inactiveGatekeepers = gatekeeperList.filter(g => !g.is_active)
  const activeChampions     = championList.filter(c => c.is_active)

  const now      = new Date()
  const today    = now.toISOString().split('T')[0]
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // QPR convention (matches getDashboardData in actions/dashboard.ts): active
  // champions + gatekeepers in this club, certified = expiry >= today, expiring
  // soon = certified AND expiry <= today+90d.
  const certPool = [...championList, ...gatekeeperList].filter(p => p.is_active)
  const certifiedCount    = certPool.filter(p => p.qpr_expiry_date && p.qpr_expiry_date >= today).length
  const expiringSoonCount = certPool.filter(p => p.qpr_expiry_date && p.qpr_expiry_date >= today && p.qpr_expiry_date <= in90Days).length
  const qprPct = certPool.length > 0 ? Math.round((certifiedCount / certPool.length) * 100) : 0

  const upcomingEvents = eventList.filter(e => new Date(e.starts_at) > now) // eventList already sorted ascending
  const nextEvent = upcomingEvents[0]

  const noActiveChampion = club.is_active && activeChampions.length === 0

  // ── Filtering ──────────────────────────────────────────────────────────────
  const gkFiltered = gkQ
    ? gatekeeperList.filter(g =>
        g.full_name.toLowerCase().includes(gkQ.toLowerCase()) ||
        g.email.toLowerCase().includes(gkQ.toLowerCase()))
    : gatekeeperList

  const evFiltered = eventList.filter(e => {
    const matchesQ = !evQ ||
      e.title.toLowerCase().includes(evQ.toLowerCase()) ||
      (e.venue ?? '').toLowerCase().includes(evQ.toLowerCase())
    const matchesType = !evType || e.type === evType
    return matchesQ && matchesType
  })

  // ── Pagination (only for the active tab; tiny datasets today, so pagination
  // controls render only when they're actually needed) ──────────────────────
  const activeTotal  = tab === 'events' ? evFiltered.length : gkFiltered.length
  const pageCount    = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE))
  const currentPage  = Math.min(requestedPage, pageCount)
  const pageStart    = (currentPage - 1) * PAGE_SIZE

  const gkPage = gkFiltered.slice(pageStart, pageStart + PAGE_SIZE)
  const evPage = evFiltered.slice(pageStart, pageStart + PAGE_SIZE)

  function buildHref(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string | undefined> = {
      tab, gkQ, evQ, evType, page: String(currentPage), ...overrides,
    }
    const params = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    const qs = params.toString()
    return qs ? `?${qs}` : '?'
  }

  return (
    <div className="flex flex-col gap-6 p-6 font-[family-name:var(--font-inter)]">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs">
        <Link href="/super-admin/clubs" className="text-[#64748B] hover:text-[#022C51]">Clubs</Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/chevron-right-breadcrumb.svg" alt="" className="h-[7px] w-[4px]" />
        <span className="font-medium text-[#022C51]">{club.name}</span>
      </nav>

      {/* Header identity */}
      <div className="flex items-center justify-between gap-6 rounded-2xl bg-white p-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] font-bold tracking-[-0.75px] text-[#0F172A]">{club.name}</h1>
            <span className="rounded-md bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#64748B]">
              #{club.club_code ?? '—'}
            </span>
            {club.is_active ? (
              <span className="flex items-center gap-1.5 rounded-full bg-[#E6FFE7] px-2.5 py-0.5 text-xs font-semibold text-[#0D8275]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-semibold text-[#64748B]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                Inactive
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/location-pin.svg" alt="" className="h-[13.6px] w-[11.05px] flex-shrink-0" />
            <p className="text-xs text-[#475569]">{club.location}</p>
          </div>
          {club.description && (
            <p className="text-xs text-[#64748B]">{club.description}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            href={`/super-admin/clubs/${id}/edit`}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#475569] shadow-sm hover:bg-gray-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/pencil.svg" alt="" className="h-3 w-3" />
            Edit Club Details
          </Link>
          <ClubStatusToggle clubId={id} isActive={club.is_active} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Gatekeepers"
          iconSrc="/icons/kpi-gatekeepers.svg"
          value={gatekeeperList.length}
          caption={`${activeGatekeepers.length} active, ${inactiveGatekeepers.length} inactive`}
        />
        <KpiCard
          label="Assigned Champions"
          iconSrc="/icons/kpi-champions.svg"
          value={activeChampions.length}
          caption="Assigned to manage this club"
        />
        <KpiCard
          label="QPR Certification Rate"
          iconSrc="/icons/kpi-qpr.svg"
          value={`${qprPct}%`}
          caption={`${certifiedCount} certified, ${expiringSoonCount} expiring soon`}
        />
        <KpiCard
          label="Upcoming Events"
          iconSrc="/icons/kpi-events.svg"
          value={upcomingEvents.length}
          caption={nextEvent ? `Next: ${formatShortDate(nextEvent.starts_at)} (${nextEvent.title})` : 'No upcoming events'}
        />
      </div>

      {/* Assigned Champions */}
      <div className="rounded-2xl bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-[family-name:var(--font-jakarta)] text-lg font-bold text-[#0F172A]">Assigned Champions</h2>
            <p className="text-xs text-[#64748B]">Champions responsible for coordinating this club&apos;s Gatekeepers.</p>
          </div>
          <Link
            href={`/super-admin/champions?club=${id}`}
            className="flex items-center gap-1 text-xs font-semibold tracking-[0.24px] text-[#012C51] hover:underline"
          >
            Manage Champions
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/arrow-right-small.svg" alt="" className="h-3 w-3" />
          </Link>
        </div>

        {noActiveChampion && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            This club has no active Champion.
          </div>
        )}

        {championList.length === 0 ? (
          <p className="text-sm text-gray-400">No champions assigned to this club.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {championList.map(c => (
              <Link
                key={c.id}
                href={`/super-admin/champions/${c.id}`}
                className="flex min-w-[240px] flex-1 items-center gap-3.5 rounded-xl bg-[#F8FAFC] p-4 transition-colors hover:bg-[#F1F5F9]"
              >
                <div className="relative flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#012C51] text-sm font-bold text-white">
                    {getInitials(c.full_name)}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${
                      c.is_active ? 'bg-[#16A34A]' : 'bg-[#94A3B8]'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold tracking-[0.24px] text-[#0F172A]">{c.full_name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-[#64748B]">{c.email}</p>
                    <span className={`flex-shrink-0 text-[11px] font-semibold ${c.is_active ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Gatekeeper Roster / Club Events */}
      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#F9F9F9] px-6 pt-3">
          <Link
            href={buildHref({ tab: 'roster', gkQ: undefined, evQ: undefined, evType: undefined, page: undefined })}
            className={`px-4 py-3 text-xs tracking-[0.24px] ${
              tab === 'roster'
                ? 'border-b-2 border-[#012C51] font-bold text-[#012C51]'
                : 'font-medium text-[#475569]'
            }`}
          >
            Gatekeeper Roster ({gatekeeperList.length})
          </Link>
          <Link
            href={buildHref({ tab: 'events', gkQ: undefined, evQ: undefined, evType: undefined, page: undefined })}
            className={`px-4 py-3 text-xs tracking-[0.24px] ${
              tab === 'events'
                ? 'border-b-2 border-[#012C51] font-bold text-[#012C51]'
                : 'font-medium text-[#475569]'
            }`}
          >
            Club Events ({eventList.length})
          </Link>
        </div>

        {/* Search & filters */}
        <div className="border-b border-[#E2E8F0] px-5 py-5">
          {tab === 'roster' ? (
            <form method="GET" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="tab" value="roster" />
              <div className="relative min-w-[240px] max-w-md flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/search-small.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  type="text"
                  name="gkQ"
                  defaultValue={gkQ}
                  placeholder="Search gatekeepers by name or email…"
                  className="w-full rounded-lg border border-transparent bg-[#F9F9F9] py-2.5 pl-9 pr-4 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#F5A623]/40 focus:outline-none focus:ring-2 focus:ring-[#F5A623]/40"
                />
              </div>
              <button type="submit" className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#475569] hover:bg-gray-50">
                Search
              </button>
            </form>
          ) : (
            <form method="GET" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="tab" value="events" />
              <div className="relative min-w-[240px] max-w-md flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/search-small.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  type="text"
                  name="evQ"
                  defaultValue={evQ}
                  placeholder="Search events by title or venue…"
                  className="w-full rounded-lg border border-transparent bg-[#F9F9F9] py-2.5 pl-9 pr-4 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#F5A623]/40 focus:outline-none focus:ring-2 focus:ring-[#F5A623]/40"
                />
              </div>
              <select
                name="evType"
                defaultValue={evType}
                className="rounded-lg border border-transparent bg-[#F9F9F9] px-3.5 py-2.5 text-[13px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F5A623]/40"
              >
                <option value="">All event types</option>
                {EVENT_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#475569] hover:bg-gray-50">
                Search
              </button>
            </form>
          )}
        </div>

        {/* Table */}
        {tab === 'roster' ? (
          gkPage.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">
              {gkQ ? 'No gatekeepers match your search.' : 'No gatekeepers assigned to this club.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#F1F5F9]">
                <thead>
                  <tr className="bg-[#F9F9F9] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                    <th className="px-6 py-3.5">Name</th>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {gkPage.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-[#0F172A]">{g.full_name}</td>
                      <td className="px-6 py-4 text-sm text-[#475569]">{g.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          g.is_active ? 'bg-[#E6FFE7] text-[#0D8275]' : 'bg-[#F1F5F9] text-[#64748B]'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${g.is_active ? 'bg-[#10B981]' : 'bg-[#94A3B8]'}`} />
                          {g.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          evPage.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">
              {evQ || evType ? 'No events match your search.' : 'No events scheduled for this club.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#F1F5F9]">
                <thead>
                  <tr className="bg-[#F9F9F9] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                    <th className="px-6 py-3.5">Event Name &amp; Category</th>
                    <th className="px-6 py-3.5">Date &amp; Time</th>
                    <th className="px-6 py-3.5">Venue</th>
                    <th className="px-6 py-3.5">Max Participants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {evPage.map(e => {
                    const style = eventTypeStyle(e.type)
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-[#0F172A]">{e.title}</p>
                          <span className={`mt-1.5 inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#0F172A]">{formatEventDate(e.starts_at)}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#475569]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/clock-small.svg" alt="" className="h-3 w-3" />
                            {formatTimeRange(e.starts_at, e.ends_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-[#0F172A]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/location-pin.svg" alt="" className="h-3 w-2.5 flex-shrink-0" />
                            {e.venue}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#475569]">{e.max_participants ?? 'Not specified'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] px-6 py-4">
            <p className="text-[10px] text-[#8492A6]">
              Showing {pageStart + 1} to {Math.min(pageStart + PAGE_SIZE, activeTotal)} of {activeTotal} {tab === 'events' ? 'Events' : 'Gatekeepers'}
            </p>
            <div className="flex items-center gap-1.5">
              <Link
                href={buildHref({ page: String(Math.max(1, currentPage - 1)) })}
                aria-disabled={currentPage === 1}
                className={`rounded px-3 py-1.5 text-[10px] font-semibold ${
                  currentPage === 1
                    ? 'pointer-events-none bg-[#F1F5F9] text-[#475569] opacity-50'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-gray-200'
                }`}
              >
                Previous
              </Link>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map(p => (
                <Link
                  key={p}
                  href={buildHref({ page: String(p) })}
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded text-[10px] font-semibold ${
                    p === currentPage ? 'bg-[#012C51] text-white' : 'text-[#475569] hover:bg-gray-100'
                  }`}
                >
                  {p}
                </Link>
              ))}
              <Link
                href={buildHref({ page: String(Math.min(pageCount, currentPage + 1)) })}
                aria-disabled={currentPage === pageCount}
                className={`rounded px-3 py-1.5 text-[10px] font-semibold ${
                  currentPage === pageCount
                    ? 'pointer-events-none bg-[#F1F5F9] text-[#475569] opacity-50'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-gray-200'
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
