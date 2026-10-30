'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { AnnouncementForm, type AnnouncementValues } from '../../../announcement-form'
import type { ClubOption } from '@/app/(dashboard)/super-admin/events/event-clubs-field'

export function EditAnnouncementModal({
  announcement,
  clubs,
}: {
  announcement: AnnouncementValues
  clubs: ClubOption[]
}) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <AnnouncementForm announcement={announcement} clubs={clubs} onClose={close} />
    </ModalOverlay>
  )
}
