'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { AnnouncementForm, type AnnouncementValues } from '@/app/(dashboard)/super-admin/announcements/announcement-form'
import { NO_PERMISSION_MESSAGE } from '../../../permission-message'

export function EditAnnouncementModal({ announcement, ownClub, canPublish }: {
  announcement: AnnouncementValues
  ownClub: { id: string; name: string }
  canPublish: boolean
}) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      {canPublish
        ? <AnnouncementForm announcement={announcement} clubs={[]} ownClub={ownClub} backHref="/champion/announcements" onClose={close} />
        : <p role="alert" className="mx-auto max-w-[560px] rounded-2xl bg-white p-6 text-[14px] text-[#475569]">{NO_PERMISSION_MESSAGE}</p>}
    </ModalOverlay>
  )
}
