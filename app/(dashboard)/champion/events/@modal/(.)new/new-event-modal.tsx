'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { CreateEventForm } from '@/app/(dashboard)/super-admin/events/create-event-form'

export function NewChampionEventModal({ club }: { club: { id: string; name: string } }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <CreateEventForm clubs={[]} ownClub={club} onClose={close} />
    </ModalOverlay>
  )
}
