import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementCard, type AnnouncementCardData } from '@/app/(dashboard)/super-admin/announcements/announcement-card'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNOUNCEMENT_CLUBS_EMBED, announcementClubsLabel } from '@/lib/announcement-clubs'

export const metadata = { title: 'Announcements — HMM Champion' }

export default async function ChampionAnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No extra .eq() filters needed — RLS ("announcements: champion read")
  // already scopes this to published, active announcements meant for them
  // plus every announcement for the Champion's own club, which is exactly
  // the set this page is meant to show.
  const { data: announcements } = await supabase
    .from('announcements')
    .select(`id, title, body, publish_date, expiry_date, priority, audience, status, created_by, is_pinned, ${ANNOUNCEMENT_CLUBS_EMBED}`)
    .order('publish_date', { ascending: false })

  // Champions may only read their own club (RLS), but an announcement can be
  // for several clubs — names only, read with the admin client.
  const { data: clubs } = await createAdminClient().from('clubs').select('id, name')
  const clubNameById = Object.fromEntries((clubs ?? []).map(c => [c.id, c.name]))

  const cards: (AnnouncementCardData & { canManage: boolean })[] = (announcements ?? []).map(a => ({
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
    // Only the authoring Champion may edit/delete their own club's
    // announcement — matches "announcements: champion update/delete own"
    // RLS exactly, so a second Champion sharing the same club sees this
    // one read-only, and platform-wide Super-Admin-authored ones are
    // always read-only here too.
    canManage: a.created_by === user.id,
  }))

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Announcements</h1>
          <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
            Platform-wide updates plus announcements for your club.
          </p>
        </div>
        <Link
          href="/champion/announcements/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-6 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Add New Announcement
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">No announcements yet.</p>
          <Link href="/champion/announcements/new" className="mt-2 inline-block text-sm font-bold text-[#003495]">
            Create your first announcement →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map(a => (
            <AnnouncementCard key={a.id} announcement={a} basePath="/champion/announcements" canManage={a.canManage} />
          ))}
        </div>
      )}
    </div>
  )
}
