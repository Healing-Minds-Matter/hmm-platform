import { championAnnouncementContext } from '../../champion-announcement-context'
import { NewAnnouncementModal } from './new-announcement-modal'

export default async function InterceptedNewChampionAnnouncementPage() {
  const ctx = await championAnnouncementContext()
  if (!ctx) return null
  return <NewAnnouncementModal ownClub={ctx.ownClub} canPublish={ctx.canPublish} />
}
