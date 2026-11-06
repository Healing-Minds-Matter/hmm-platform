'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { CreateResourceForm } from '../../create-resource-form'
import type { ResourceCategory } from '@/lib/resource-categories'

export function NewResourceModal({ categories }: { categories: ResourceCategory[] }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <CreateResourceForm categories={categories} onClose={close} />
    </ModalOverlay>
  )
}
