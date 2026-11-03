'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { CreateGatekeeperForm } from '../../create-gatekeeper-form'
import type { AwardableType } from '@/lib/certifications.server'

interface Club { id: string; name: string; club_code: string | null }
interface Champion { id: string; full_name: string; club_id: string | null }

export function NewGatekeeperModal({ clubs, champions, certTypes }: { clubs: Club[]; champions: Champion[]; certTypes: AwardableType[] | null }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <CreateGatekeeperForm
        scope={{ mode: 'select', clubs, champions }}
        redirectPath="/super-admin/gatekeepers"
        onClose={close}
        certTypes={certTypes}
      />
    </ModalOverlay>
  )
}
