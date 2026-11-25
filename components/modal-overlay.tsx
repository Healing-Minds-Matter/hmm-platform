'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { FOCUSABLE_SELECTOR, isTabbable, nextTrapTarget, popModal, pushModal, isTopModal } from '@/lib/modal-focus'

// Shared modal overlay: dimmed + blurred backdrop over whatever page is
// behind it, closes on backdrop click or Escape. The card itself stops click
// propagation so clicking inside it never closes the modal. Same pattern
// used for the Clubs Create/Edit modals — reused here for Champions.
//
// Fix P: the card is a real dialog — role="dialog" + aria-modal, named by its
// first heading; focus moves into it on open, Tab / Shift+Tab stay inside,
// Esc closes, and focus goes back to whatever opened it when it closes.
// Content that already declares its own dialog role (e.g. the logout
// confirm) keeps that role and the card stays a plain box.
export function ModalOverlay({ onClose, children, maxWidth = 672 }: { onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const fallbackHeadingId = useId()
  // Whatever had focus when the pop-up first rendered (usually the button or
  // link that opened it). Read during the first render, before any autoFocus
  // inside the pop-up moves focus.
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))
  const [dialog, setDialog] = useState<{ own: boolean; labelledBy?: string }>({ own: true })

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Name the dialog after its first heading; skip if the content is already a dialog.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    if (card.querySelector('[role="dialog"], [role="alertdialog"]')) {
      setDialog({ own: false })
      return
    }
    const heading = card.querySelector<HTMLElement>('h1, h2, h3, [role="heading"]')
    if (heading) {
      if (!heading.id) heading.id = fallbackHeadingId
      setDialog({ own: true, labelledBy: heading.id })
    }
  }, [fallbackHeadingId])

  useEffect(() => {
    const card = cardRef.current
    const id = pushModal()

    // Move focus inside, unless something inside (autoFocus) already has it.
    if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true })

    const tabbables = (): HTMLElement[] =>
      card
        ? Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el =>
            isTabbable({
              disabled: (el as HTMLButtonElement).disabled === true,
              tabIndex: el.tabIndex,
              type: el instanceof HTMLInputElement ? el.type : undefined,
              rendered: el.getClientRects().length > 0,
            }),
          )
        : []

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopModal(id)) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !card) return
      const list = tabbables()
      const current = list.indexOf(document.activeElement as HTMLElement)
      const target = nextTrapTarget(list.length, current, e.shiftKey)
      if (target === null) return
      e.preventDefault()
      if (target === 'self') card.focus()
      else list[target].focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      popModal(id)
      // Send focus back to what opened the pop-up, if it is still on the page.
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [opener])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(86,86,86,0.41)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        role={dialog.own ? 'dialog' : undefined}
        aria-modal={dialog.own ? true : undefined}
        aria-labelledby={dialog.own ? dialog.labelledBy : undefined}
        onClick={e => e.stopPropagation()}
        className="w-full outline-none"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  )
}
