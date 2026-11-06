'use client'

import { useEffect, useRef } from 'react'

interface Props {
  secondsLeft:  number
  onStayActive: () => void
}

// Shown 2 minutes before the idle sign-out (lib/session-policy.ts). The
// countdown itself is driven by hooks/use-session-timeout.ts.
export function SessionTimeoutModal({ secondsLeft, onStayActive }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { buttonRef.current?.focus() }, [])

  const m = Math.floor(secondsLeft / 60)
  const s = (secondsLeft % 60).toString().padStart(2, '0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-desc"
        className="w-full max-w-sm mx-4 rounded-2xl bg-white p-8 shadow-2xl text-center"
      >
        <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⏱
        </div>
        <h2 id="session-timeout-title" className="mb-2 text-lg font-semibold text-gray-900">
          Session expiring soon
        </h2>
        <p id="session-timeout-desc" className="mb-6 text-sm text-gray-500">
          You&apos;ll be signed out in{' '}
          <span className="font-semibold text-amber-600">
            {m}:{s}
          </span>{' '}
          because you haven&apos;t been active.
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={onStayActive}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Stay signed in
        </button>
      </div>
    </div>
  )
}
