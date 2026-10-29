'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { EditEventForm, type EventValues } from '../../../[id]/edit/edit-event-form'

export function EditEventModal({ event }: { event: EventValues }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <EditEventForm event={event} onClose={close} />
    </ModalOverlay>
  )
}
