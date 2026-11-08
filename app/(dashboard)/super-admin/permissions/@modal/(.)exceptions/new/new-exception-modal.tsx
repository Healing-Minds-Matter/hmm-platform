'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { NewExceptionForm, type PermissionOption } from '../../../exceptions/new/new-exception-form'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export function NewExceptionModal({ users, permissions }: { users: UserOption[]; permissions: PermissionOption[] }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <NewExceptionForm users={users} permissions={permissions} onClose={close} />
    </ModalOverlay>
  )
}
