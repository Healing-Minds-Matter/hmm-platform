'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { CreateGatekeeperForm } from '@/app/(dashboard)/super-admin/gatekeepers/create-gatekeeper-form'
import type { AwardableType } from '@/lib/certifications.server'

export function NewGatekeeperModal({ clubName, certTypes }: { clubName: string; certTypes: AwardableType[] | null }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <CreateGatekeeperForm scope={{ mode: 'fixed', clubName }} redirectPath="/champion/gatekeepers" onClose={close} certTypes={certTypes} />
    </ModalOverlay>
  )
}
