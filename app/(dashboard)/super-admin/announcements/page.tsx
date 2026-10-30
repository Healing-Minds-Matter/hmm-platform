import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementFilters } from './announcement-filters'
import { AnnouncementStatusTabs } from './announcement-status-tabs'
import { AnnouncementCard, type AnnouncementCardData } from './announcement-card'
import { computeStatus } from './announcement-status'
import { ANNOUNCEMENT_CLUBS_EMBED, announcementClubsLabel } from '@/lib/announcement-clubs'

export const metadata = { title: 'Announcements — HMM Super Admin' }

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; audience?: string; status?: string }>
}) {
  const { q, audience, status } = await searchParams
  const supabase = await createClient()

  // Super Admin manages every announcement, whatever its audience or clubs.
  let query = supabase
    .from('announcements')
    .select(`id, title, body, publish_date, expiry_date, priority, audience, status, is_pinned, ${ANNOUNCEMENT_CLUBS_EMBED}`)
    .order('publish_date', { ascending: false })

  if (q) query = query.ilike('title', `%${q}%`)
  if (audience) query = query.eq('audience', audience)

  const [{ data: announcements }, { data: allForStats }, { data: clubs }] = await Promise.all([
    query,
    supabase.from('announcements').select('publish_date, expiry_date, status'),
    supabase.from('clubs').select('id, name'),
  ])
  const clubNameById = Object.fromEntries((clubs ?? []).map(c => [c.id, c.name]))

  const filtered = status
    ? (announcements ?? []).filter(a => computeStatus(a.status, a.publish_date, a.expiry_date).tab === status)
    : (announcements ?? [])

  const cards: AnnouncementCardData[] = filtered.map(a => ({
    id: a.id,
    title: a.title,
    body: a.body,
    publish_date: a.publish_date,
    expiry_date: a.expiry_date,
    priority: a.priority,
    audience: a.audience,
    status: a.status,
    is_pinned: a.is_pinned,
    club_name: announcementClubsLabel(a, clubNameById),
  }))

  const pinnedCount = filtered.filter(a => a.is_pinned).length

  const all = allForStats ?? []
  const counts = { active: 0, scheduled: 0, drafts: 0 }
  for (const a of all) {
    const tab = computeStatus(a.status, a.publish_date, a.expiry_date).tab
    if (tab === 'active') counts.active++
    else if (tab === 'scheduled') counts.scheduled++
    else if (tab === 'drafts') counts.drafts++
  }

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Announcements</h1>
          <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
            Broadcast updates, protocol guidelines, and reminders across champions and clinical gatekeepers.
          </p>
          {pinnedCount > 0 && (
            <p className="text-[12px] text-[#64748B]">
              {pinnedCount} pinned{pinnedCount > 3 ? ' — the Gatekeeper mobile app only features the 3 most recent' : ''}
            </p>
          )}
        </div>
        <Link
          href="/super-admin/announcements/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-6 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Add New Announcement
        </Link>
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <AnnouncementFilters q={q} audience={audience} status={status} />
        <div className="border-t border-[#F1F5F9] pt-2">
          <AnnouncementStatusTabs active={status} counts={counts} total={all.length} q={q} audience={audience} />
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">
            {q || audience || status ? 'No announcements match your filters.' : 'No announcements yet.'}
          </p>
          {!q && !audience && !status && (
            <Link href="/super-admin/announcements/new" className="mt-2 inline-block text-sm font-bold text-[#003495]">
              Create your first announcement →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map(a => <AnnouncementCard key={a.id} announcement={a} />)}
        </div>
      )}
    </div>
  )
}
