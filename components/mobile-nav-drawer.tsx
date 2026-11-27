'use client'

import { useEffect, useRef } from 'react'
import { FOCUSABLE_SELECTOR, isTabbable, isTopModal, nextTrapTarget, popModal, pushModal } from '@/lib/modal-focus'

// Fix Q1: below the desktop breakpoint (1024px) the sidebar lives in this
// slide-out panel, opened by the menu button in the header.
//
// Closes on a link click inside it, Esc, a click on the dark backdrop, its
// own close button, or when the window grows to desktop width. While open,
// focus moves inside and Tab / Shift+Tab stay inside (Fix P's rules in
// lib/modal-focus.ts); when it closes, focus goes back to the menu button.
//
// Always rendered (so it can slide), but `invisible` while closed, which
// also takes it out of the tab order and away from screen readers.

export const DESKTOP_QUERY = '(min-width: 1024px)'

export function MobileNavDrawer({
  open,
  onClose,
  returnFocusRef,
  children,
}: {
  open: boolean
  onClose: () => void
  /** The menu button: focus goes back here when the panel closes. */
  returnFocusRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const id = pushModal()
    closeRef.current?.focus({ preventScroll: true })

    const tabbables = (): HTMLElement[] =>
      panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el =>
            isTabbable({
              disabled: (el as HTMLButtonElement).disabled === true,
              tabIndex: el.tabIndex,
              type: el instanceof HTMLInputElement ? el.type : undefined,
              rendered: el.getClientRects().length > 0,
            }),
          )
        : []

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopModal(id) || !panel) return
      // Another modal on top (e.g. the session-timeout warning) owns the keys.
      const otherModal = document.activeElement?.closest('[aria-modal="true"]')
      if (otherModal && !panel.contains(otherModal)) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = tabbables()
      const target = nextTrapTarget(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey)
      if (target === null) return
      e.preventDefault()
      if (target === 'self') panel.focus()
      else list[target].focus()
    }

    // Rotating a tablet / widening the window to desktop: the sidebar is back,
    // so the panel closes.
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
    const handleWide = (e: MediaQueryListEvent) => { if (e.matches) onCloseRef.current() }
    mq?.addEventListener('change', handleWide)

    document.addEventListener('keydown', handleKeyDown)
    const returnTo = returnFocusRef
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      mq?.removeEventListener('change', handleWide)
      popModal(id)
      returnTo.current?.focus({ preventScroll: true })
    }
  }, [open, returnFocusRef])

  // Any link inside closes the panel (the page change happens as normal).
  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('a[href]')) onClose()
  }

  return (
    <div className={`lg:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div
        data-testid="mobile-nav-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-[rgba(86,86,86,0.41)] transition-opacity duration-200 motion-reduce:transition-none ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={panelRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        tabIndex={-1}
        onClick={handleClick}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl outline-none transition-[transform,visibility] duration-200 motion-reduce:transition-none font-[family-name:var(--font-inter)] ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex justify-end px-3 pt-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#265BA2]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
