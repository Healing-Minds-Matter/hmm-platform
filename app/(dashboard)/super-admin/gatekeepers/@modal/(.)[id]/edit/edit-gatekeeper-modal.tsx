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
  club_id: string | null
  version: number
}
interface Club { id: string; name: string; club_code: string | null }

export function EditGatekeeperModal({ gatekeeper, clubs }: { gatekeeper: Gatekeeper; clubs: Club[] }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <GatekeeperEditForm gatekeeper={gatekeeper} clubs={clubs} onClose={close} />
    </ModalOverlay>
  )
}
