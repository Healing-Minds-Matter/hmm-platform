'use client'

import { useEffect } from 'react'

// Shared modal overlay: dimmed + blurred backdrop over whatever page is
// behind it, closes on backdrop click or Escape. The card itself stops click
// propagation so clicking inside it never closes the modal. Same pattern
// used for the Clubs Create/Edit modals — reused here for Champions.
export function ModalOverlay({ onClose, children, maxWidth = 672 }: { onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(86,86,86,0.41)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} className="w-full" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}
