'use client'

import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'

// Wraps a form shown as a pop-up over the page it was opened from
// (intercepting route). Backdrop click or Escape goes back.
export function RouteModal({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return <ModalOverlay onClose={() => router.back()}>{children}</ModalOverlay>
}
