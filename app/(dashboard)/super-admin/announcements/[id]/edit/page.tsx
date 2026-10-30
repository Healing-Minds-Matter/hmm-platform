import { notFound } from 'next/navigation'
import { AnnouncementForm } from '../../announcement-form'
import { loadAnnouncementForEdit } from '../../load-announcement-for-edit'

export const metadata = { title: 'Edit Announcement — HMM Super Admin' }

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const loaded = await loadAnnouncementForEdit(id)
  if (!loaded) notFound()

  return (
    <div className="flex justify-center p-8">
      <AnnouncementForm announcement={loaded.announcement} clubs={loaded.clubs} />
    </div>
  )
}
