'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { EditEventForm } from './edit-event-form'
import type { EditEventProps } from './load-event-for-edit'

export function EditEventModal(props: EditEventProps) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <EditEventForm {...props} onClose={close} />
    </ModalOverlay>
  )
}
