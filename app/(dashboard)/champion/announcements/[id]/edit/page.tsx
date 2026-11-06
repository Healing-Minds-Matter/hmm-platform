import { notFound } from 'next/navigation'
import { AnnouncementForm } from '@/app/(dashboard)/super-admin/announcements/announcement-form'
import { championAnnouncementContext, loadOwnAnnouncement } from '../../champion-announcement-context'
import { NoAnnouncementPermission } from '../../no-permission'

export const metadata = { title: 'Edit Announcement — HMM Champion' }

// The same form as Super Admins (sheet row 61), for the Champion's own announcements.
export default async function EditChampionAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await championAnnouncementContext()
  if (!ctx) notFound()
  const loaded = await loadOwnAnnouncement(id, ctx.userId)
  if (!loaded) notFound()
  return (
    <div className="flex justify-center p-8">
      {ctx.canPublish
        ? <AnnouncementForm announcement={loaded.announcement} clubs={[]} ownClub={ctx.ownClub} backHref="/champion/announcements" />
        : <NoAnnouncementPermission />}
    </div>
  )
}
