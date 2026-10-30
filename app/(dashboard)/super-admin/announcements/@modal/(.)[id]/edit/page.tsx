import { notFound } from 'next/navigation'
import { EditAnnouncementModal } from './edit-announcement-modal'
import { loadAnnouncementForEdit } from '../../../load-announcement-for-edit'

export default async function InterceptedEditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadAnnouncementForEdit(id)
  if (!loaded) notFound()

  return <EditAnnouncementModal announcement={loaded.announcement} clubs={loaded.clubs} />
}
