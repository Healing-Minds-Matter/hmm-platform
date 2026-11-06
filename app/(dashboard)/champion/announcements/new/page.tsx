import { CreateAnnouncementForm } from '@/app/(dashboard)/super-admin/announcements/create-announcement-form'
import { championAnnouncementContext } from '../champion-announcement-context'
import { NoAnnouncementPermission } from '../no-permission'

export const metadata = { title: 'New Announcement — HMM Champion' }

// The same form as Super Admins (sheet row 61), limited to the Champion's own club.
export default async function NewChampionAnnouncementPage() {
  const ctx = await championAnnouncementContext()
  if (!ctx) return null
  return (
    <div className="flex justify-center p-8">
      {ctx.canPublish
        ? <CreateAnnouncementForm clubs={[]} ownClub={ctx.ownClub} backHref="/champion/announcements" />
        : <NoAnnouncementPermission />}
    </div>
  )
}
