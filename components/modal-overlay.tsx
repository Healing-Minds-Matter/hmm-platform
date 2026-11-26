'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { FOCUSABLE_SELECTOR, dialogName, isTabbable, isTopModal, nextTrapTarget, pickReturnFocus, popModal, pushModal, type DialogName } from '@/lib/modal-focus'

// Shared modal overlay: dimmed + blurred backdrop over whatever page is
// behind it, closes on backdrop click or Escape. The card itself stops click
// propagation so clicking inside it never closes the modal. Same pattern
// used for the Clubs Create/Edit modals — reused here for Champions.
//
// Fix P: the card is a real dialog — role="dialog" + aria-modal, named by its
// first heading (or `ariaLabel` when there is none); focus moves into it on
// open, Tab / Shift+Tab stay inside, Esc closes, and focus goes back to
// whatever opened it when it closes (else `returnFocusRef`, else <main>).
// Content that already declares its own dialog role (e.g. the logout
// confirm) keeps that role and the card stays a plain box.
export function ModalOverlay({
  onClose,
  children,
  maxWidth = 672,
  ariaLabel,
  returnFocusRef,
}: {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
  /** Accessible name, used only when the pop-up has no h1–h3 heading. */
  ariaLabel?: string
  /** Where focus goes on close if the element that opened the pop-up is gone. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const returnFocusRefRef = useRef(returnFocusRef)
  const fallbackHeadingId = useId()
  // Whatever had focus when the pop-up first rendered (usually the button or
  // link that opened it). Read during the first render, before any autoFocus
  // inside the pop-up moves focus.
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))
  const [dialog, setDialog] = useState<{ own: boolean; name: DialogName }>({ own: true, name: null })

  useEffect(() => {
    onCloseRef.current = onClose
    returnFocusRefRef.current = returnFocusRef
  }, [onClose, returnFocusRef])

  // Name the dialog after its first heading (or ariaLabel); skip if the
  // content is already a dialog. Re-checked whenever the content changes,
  // e.g. a form swapping to its success screen.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    let warned = false
    const update = () => {
      if (card.querySelector('[role="dialog"], [role="alertdialog"]')) {
        setDialog(d => (d.own ? { own: false, name: null } : d))
        return
      }
      const heading = card.querySelector<HTMLElement>('h1, h2, h3, [role="heading"]')
      if (heading && !heading.id) heading.id = fallbackHeadingId
      const name = dialogName(heading?.id, ariaLabel)
      setDialog(d => (d.own && JSON.stringify(d.name) === JSON.stringify(name) ? d : { own: true, name }))
      if (!name && !warned && process.env.NODE_ENV !== 'production') {
        warned = true
        console.warn('ModalOverlay: this pop-up has no h1–h3 heading and no ariaLabel, so screen readers announce it without a name.')
      }
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(card, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [fallbackHeadingId, ariaLabel])

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
      if (!isTopModal(id) || !card) return
      // Focus is in another modal on top of this one (e.g. the session-timeout
      // warning): leave the keys to it.
      const otherModal = document.activeElement?.closest('[aria-modal="true"]')
      if (otherModal && !card.contains(otherModal)) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
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
      // Send focus back to what opened the pop-up; if that is gone (e.g. the
      // Log out item in a closed menu), to returnFocusRef, else to <main>.
      const target = pickReturnFocus(
        opener instanceof HTMLElement && opener !== document.body ? opener : null,
        returnFocusRefRef.current?.current ?? null,
        document.querySelector<HTMLElement>('main'),
      )
      target?.focus({ preventScroll: true })
    }
  }, [opener])

  const name = dialog.own ? dialog.name : null
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
        aria-labelledby={name && 'labelledBy' in name ? name.labelledBy : undefined}
        aria-label={name && 'label' in name ? name.label : undefined}
        onClick={e => e.stopPropagation()}
        className="w-full outline-none"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  )
}
