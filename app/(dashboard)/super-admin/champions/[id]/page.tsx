import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChampionStatusControls } from './champion-status-controls'
import { eventTypeStyle } from '@/app/(dashboard)/super-admin/events/event-type'
// Event dates/times are shown in Sri Lanka time (see lib/org-date.ts).
import { ORG_TIME_ZONE } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, isEventForClub } from '@/lib/event-clubs'

export const metadata = { title: 'Champion Details — HMM Super Admin' }

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
      <div className="flex items-center justify-between gap-2">
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

// QPR convention (matches Club detail page): certified = expiry >= today;
// expiring soon = certified AND expiry <= today+90d.
function qprLine(qprExpiryDate: string | null, today: string, in90Days: string) {
  if (!qprExpiryDate) {
    return { text: 'QPR certification not on file', className: 'text-[#94A3B8]' }
  }
  const certified = qprExpiryDate >= today
  const expiringSoon = certified && qprExpiryDate <= in90Days
  const expiryLabel = formatEventDate(qprExpiryDate)
  if (!certified) {
    return { text: `QPR Certification Expired (${expiryLabel})`, className: 'text-[#94A3B8]' }
  }
  if (expiringSoon) {
    return { text: `QPR Certified — Expiring Soon (Expires ${expiryLabel})`, className: 'text-[#D97706]' }
  }
  return { text: `QPR Certified (Expires ${expiryLabel})`, className: 'text-[#16A34A]' }
}

export default async function ChampionDetailPage({
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

  const { data: champion } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, title, is_active, deactivation_reason, club_id, qpr_certification_date, qpr_expiry_date, created_at, clubs!profiles_club_id_fkey(id, name, club_code, location, is_active)')
    .eq('id', id)
    .eq('role', 'champion')
    .single()

  if (!champion) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = champion.clubs as any
  const clubId: string | null = champion.club_id

  const [{ data: clubChampions }, { data: gatekeepers }, { data: events }] = await Promise.all([
    clubId
      ? supabase
          .from('profiles')
          .select('id, is_active, qpr_expiry_date')
          .eq('club_id', clubId)
          .eq('role', 'champion')
      : Promise.resolve({ data: [] as { id: string; is_active: boolean; qpr_expiry_date: string | null }[] }),
    clubId
      ? supabase
          .from('profiles')
          .select('id, full_name, email, phone, is_active, qpr_certification_date, qpr_expiry_date')
          .eq('club_id', clubId)
          .eq('role', 'gatekeeper')
          .order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string; phone: string | null; is_active: boolean; qpr_certification_date: string | null; qpr_expiry_date: string | null }[] }),
    clubId
      ? supabase
          .from('events')
          .select(`id, title, type, starts_at, ends_at, venue, max_participants, is_cancelled, ${EVENT_CLUBS_EMBED}`)
          .eq('is_cancelled', false)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; title: string; type: string; starts_at: string; ends_at: string | null; venue: string; max_participants: number | null; is_cancelled: boolean; event_clubs?: { club_id: string }[] }[] }),
  ])

  const clubChampionList = clubChampions ?? []
  const gatekeeperList   = gatekeepers ?? []
  // Events linked to this club, plus events open to all clubs.
  const eventList        = (events ?? []).filter(e => clubId !== null && isEventForClub(e, clubId))

  // ── KPI computations ──────────────────────────────────────────────────────
  const activeGatekeepers   = gatekeeperList.filter(g => g.is_active)
  const inactiveGatekeepers = gatekeeperList.filter(g => !g.is_active)

  const now      = new Date()
  const today    = now.toISOString().split('T')[0]
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // "Gatekeepers in this club" and "Club QPR Certification Rate" — reframed
  // honestly per the club-scope decision (a champion isn't individually
  // assigned specific gatekeepers; a club can have multiple champions). Rate
  // computation is the exact same certified/expiring-soon convention as the
  // Club detail page's QPR Certification Rate KPI, scoped to this champion's
  // club_id, among active champions + gatekeepers in that club.
  const certPool = [...clubChampionList, ...gatekeeperList].filter(p => p.is_active)
  const certifiedCount    = certPool.filter(p => p.qpr_expiry_date && p.qpr_expiry_date >= today).length
  const expiringSoonCount = certPool.filter(p => p.qpr_expiry_date && p.qpr_expiry_date >= today && p.qpr_expiry_date <= in90Days).length
  const qprPct = certPool.length > 0 ? Math.round((certifiedCount / certPool.length) * 100) : 0

  const championQpr = qprLine(champion.qpr_expiry_date, today, in90Days)

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

  // ── Pagination (only for the active tab) ────────────────────────────────
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
    const p = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const qs = p.toString()
    return qs ? `?${qs}` : '?'
  }

  const gkKpiLabel = club ? `Gatekeepers in ${club.name}` : 'Gatekeepers in Club'

  return (
    <div className="flex flex-col gap-6 p-6 font-[family-name:var(--font-inter)]">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs">
        <Link href="/super-admin/champions" className="text-[#64748B] hover:text-[#022C51]">Champion</Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/chevron-right-breadcrumb.svg" alt="" className="h-[7px] w-[4px]" />
        <span className="font-medium text-[#022C51]">{champion.full_name}</span>
      </nav>

      {/* Header identity */}
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-white p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-[#012C51] text-2xl font-bold text-white">
            {getInitials(champion.full_name)}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-bold tracking-[-0.22px] text-[#0F172A]">{champion.full_name}</h1>
              {champion.is_active ? (
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
            <p className="text-sm text-[#475569]">
              {champion.title && <>{champion.title} • </>}
              {club ? (
                <Link href={`/super-admin/clubs/${club.id}`} className="text-[#003495] hover:underline">
                  {club.name}
                </Link>
              ) : (
                'No club assigned'
              )}
              {club && !club.is_active && <span className="ml-1 text-xs text-[#DC2626]">(inactive)</span>}
            </p>
            {!champion.is_active && champion.deactivation_reason && (
              <p className="text-xs text-[#94A3B8]">
                {champion.deactivation_reason === 'club_deactivated' ? 'Deactivated when club was deactivated' : 'Manually deactivated'}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/mail.svg" alt="" width={15} height={12} />
                <span className="text-[13px] text-[#0F172A]">{champion.email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/phone.svg" alt="" width={13.5} height={13.5} />
                <span className="text-[13px] text-[#0F172A]">{champion.phone ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/shield-check.svg" alt="" width={14.67} height={14} />
                <span className={`text-[13px] ${championQpr.className}`}>{championQpr.text}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/super-admin/champions/${id}/permissions`}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#475569] shadow-sm hover:bg-gray-50"
          >
            View Permissions
          </Link>
          {champion.is_active && (
            <Link
              href={`/super-admin/champions/${id}/edit`}
              className="flex items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#DB9A15]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pencil.svg" alt="" className="h-3 w-3 brightness-0 invert" />
              Edit Champion
            </Link>
          )}
          <ChampionStatusControls
            championId={id}
            isActive={champion.is_active}
            clubIsActive={club?.is_active ?? false}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label={gkKpiLabel}
          iconSrc="/icons/kpi-gatekeepers.svg"
          value={club ? gatekeeperList.length : '—'}
          caption={club ? `${activeGatekeepers.length} active, ${inactiveGatekeepers.length} inactive` : 'No club assigned'}
        />
        <KpiCard
          label="Club QPR Certification Rate"
          iconSrc="/icons/kpi-qpr.svg"
          value={club ? `${qprPct}%` : '—'}
          caption={club ? `${certifiedCount} certified, ${expiringSoonCount} expiring soon` : 'No club assigned'}
        />
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
              {!club ? 'This champion has no assigned club.' : gkQ ? 'No gatekeepers match your search.' : 'No gatekeepers in this club.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#F1F5F9]">
                <thead>
                  <tr className="bg-[#F9F9F9] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                    <th className="px-6 py-3.5">Gatekeeper</th>
                    <th className="px-6 py-3.5">Email &amp; Phone</th>
                    <th className="px-6 py-3.5">QPR Certified Date</th>
                    <th className="px-6 py-3.5">Expiry Date</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {gkPage.map(g => {
                    const expiringSoon = g.is_active && !!g.qpr_expiry_date && g.qpr_expiry_date >= today && g.qpr_expiry_date <= in90Days
                    return (
                      <tr key={g.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#012C51] text-xs font-bold text-white">
                              {getInitials(g.full_name)}
                            </div>
                            <span className="text-xs font-semibold tracking-[0.24px] text-[#0F172A]">{g.full_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-[#0F172A]">{g.email}</p>
                          <p className="mt-0.5 text-xs text-[#64748B]">{g.phone ?? '—'}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#475569]">
                          {g.qpr_certification_date ? formatEventDate(g.qpr_certification_date) : '—'}
                        </td>
                        <td className={`px-6 py-4 text-sm ${expiringSoon ? 'font-medium text-[#D97706]' : 'text-[#0F172A]'}`}>
                          {g.qpr_expiry_date ? formatEventDate(g.qpr_expiry_date) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {!g.is_active ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-semibold text-[#64748B]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                              Inactive
                            </span>
                          ) : expiringSoon ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D97706]/10 px-2.5 py-0.5 text-xs font-semibold text-[#D97706]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                              Expiring Soon
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6FFE7] px-2.5 py-0.5 text-xs font-semibold text-[#0D8275]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          evPage.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">
              {!club ? 'This champion has no assigned club.' : evQ || evType ? 'No events match your search.' : 'No events scheduled for this club.'}
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
