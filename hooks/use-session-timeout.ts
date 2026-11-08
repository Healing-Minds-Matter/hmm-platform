'use client'

// Idle sign-out for the web portals (Story 1.4, sheet row 5). Values live in
// lib/session-policy.ts.
//
// Activity in any open tab counts: the last activity time is shared through
// localStorage, and each tab checks the clock every second instead of relying
// on one long setTimeout (browsers pause or delay those in background tabs and
// while a laptop sleeps). The server enforces the same limits in middleware.ts,
// so a closed or frozen tab can't keep a session alive. While the user is
// active the hook pings the server now and then (`onHeartbeat`) so the server
// knows they are still there even if they haven't changed page.

import { useCallback, useEffect, useRef, useState } from 'react'
import { LAST_ACTIVITY_STORAGE_KEY, idleState, secondsUntilIdleSignOut } from '@/lib/session-policy'

// Capture phase, so scrolling inside a panel (the portal scrolls its main area,
// not the window) and the mouse wheel count as activity too.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll', 'click'] as const
const LISTEN = { passive: true, capture: true } as const
const WRITE_EVERY_MS = 5_000
const HEARTBEAT_EVERY_MS = 5 * 60 * 1000

function readShared(): number | null {
  try {
    const v = Number(window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeShared(t: number) {
  try { window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(t)) } catch { /* storage unavailable: this tab still times itself */ }
}

interface Options {
  /** When this sign-in happened (ms since epoch), for the 12-hour limit; null if unknown. */
  signedInAt: number | null
  onTimeout: () => void
  onHeartbeat: () => void
}

export function useSessionTimeout({ signedInAt, onTimeout, onHeartbeat }: Options) {
  const lastActivity = useRef(0)
  const lastWrite = useRef(0)
  const lastHeartbeat = useRef(0)
  const warning = useRef(false)
  const ended = useRef(false)
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const onTimeoutRef = useRef(onTimeout)
  const onHeartbeatRef = useRef(onHeartbeat)
  useEffect(() => { onTimeoutRef.current = onTimeout }, [onTimeout])
  useEffect(() => { onHeartbeatRef.current = onHeartbeat }, [onHeartbeat])

  const markActive = useCallback((force: boolean) => {
    const now = Date.now()
    lastActivity.current = now
    if (force || now - lastWrite.current >= WRITE_EVERY_MS) {
      lastWrite.current = now
      writeShared(now)
    }
    if (now - lastHeartbeat.current >= HEARTBEAT_EVERY_MS) {
      lastHeartbeat.current = now
      onHeartbeatRef.current()
    }
  }, [])

  /** "Stay signed in": counts as activity even while the warning is showing. */
  const stayActive = useCallback(() => {
    warning.current = false
    setShowWarning(false)
    lastHeartbeat.current = 0 // tell the server straight away
    markActive(true)
  }, [markActive])

  useEffect(() => {
    const now = Date.now()
    lastActivity.current = Math.max(now, readShared() ?? 0)
    lastHeartbeat.current = now // the page load itself just reached the server
    writeShared(lastActivity.current)

    // Once the warning shows, only "Stay signed in" keeps the session going.
    const handleActivity = () => { if (!warning.current) markActive(false) }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, LISTEN))

    const tick = () => {
      if (ended.current) return
      const shared = readShared()
      if (shared && shared > lastActivity.current) lastActivity.current = shared // activity in another tab
      const now = Date.now()
      const state = idleState(now, lastActivity.current, signedInAt)
      if (state === 'expired') {
        ended.current = true
        onTimeoutRef.current()
        return
      }
      const isWarning = state === 'warning'
      if (isWarning !== warning.current) {
        warning.current = isWarning
        setShowWarning(isWarning)
      }
      if (isWarning) setSecondsLeft(secondsUntilIdleSignOut(now, lastActivity.current))
    }
    tick()
    const interval = window.setInterval(tick, 1000)

    return () => {
      window.clearInterval(interval)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity, LISTEN))
    }
  }, [markActive, signedInAt])

  return { showWarning, secondsLeft, stayActive }
}
