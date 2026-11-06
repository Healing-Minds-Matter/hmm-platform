import { notFound } from 'next/navigation'
import { championAnnouncementContext, loadOwnAnnouncement } from '../../../champion-announcement-context'
import { EditAnnouncementModal } from './edit-announcement-modal'

export default async function InterceptedEditChampionAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await championAnnouncementContext()
  if (!ctx) notFound()
  const loaded = await loadOwnAnnouncement(id, ctx.userId)
  if (!loaded) notFound()
  return <EditAnnouncementModal announcement={loaded.announcement} ownClub={ctx.ownClub} canPublish={ctx.canPublish} />
}
