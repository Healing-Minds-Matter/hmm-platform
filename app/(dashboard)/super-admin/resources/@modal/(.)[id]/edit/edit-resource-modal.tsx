'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { EditResourceForm } from '../../../resource-form'
import type { ResourceCategory } from '@/lib/resource-categories'

interface ResourceValues {
  id: string
  title: string
  description: string | null
  type: string
  category: string | null
  category_id: string | null
  publication_date: string
  content_url: string | null
  content_text: string | null
  status: string
}

export function EditResourceModal({ resource, categories }: { resource: ResourceValues; categories: ResourceCategory[] }) {
  const router = useRouter()
  const close = () => router.back()

  return (
    <ModalOverlay onClose={close}>
      <EditResourceForm resource={resource} categories={categories} onClose={close} />
    </ModalOverlay>
  )
}
