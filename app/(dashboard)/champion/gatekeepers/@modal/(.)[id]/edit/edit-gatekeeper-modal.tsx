'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { GatekeeperEditForm } from '../../../[id]/edit/gatekeeper-edit-form'

interface Gatekeeper {
  id: string
  full_name: string
  email: string
  phone: string | null
  preferred_language: string
  club_id: string
  version: number
}

export function EditGatekeeperModal({ gatekeeper, clubName, emailLocked }: { gatekeeper: Gatekeeper; clubName: string; emailLocked: boolean }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <GatekeeperEditForm gatekeeper={gatekeeper} clubName={clubName} onClose={close} emailLocked={emailLocked} />
    </ModalOverlay>
  )
}
