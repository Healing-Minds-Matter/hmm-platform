'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { CreateGatekeeperForm } from '@/app/(dashboard)/super-admin/gatekeepers/create-gatekeeper-form'

export function NewGatekeeperModal({ clubName }: { clubName: string }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <CreateGatekeeperForm scope={{ mode: 'fixed', clubName }} redirectPath="/champion/gatekeepers" onClose={close} />
    </ModalOverlay>
  )
}
