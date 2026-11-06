// Web portal session rules (Story 1.4, sheet row 5). One place for the values:
// the browser timer (hooks/use-session-timeout.ts) and the server check
// (middleware.ts) both read them from here.
//
// Before 2026-11 the portal used a 20-minute idle timeout with no maximum
// session length, timed separately in each browser tab, so an idle second tab
// signed the user out while they were working in another one.

/** Signed out after this long with no activity. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
/** The "Stay signed in" warning appears this long before the idle sign-out. */
export const SESSION_WARNING_MS = 2 * 60 * 1000
/** Signed out this long after signing in, however active the user is. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** httpOnly cookie holding the time (ms since epoch) of the user's last request. */
export const LAST_ACTIVE_COOKIE = 'hmm_last_active'
/** localStorage key shared by every open tab: the time of the user's last activity. */
export const LAST_ACTIVITY_STORAGE_KEY = 'hmm:last-activity'

export type SessionEnd = 'idle' | 'max_age' | null

/**
 * Whether a session has ended, and why. `lastActiveAt`/`signedInAt` are ms
 * since epoch; a missing value never ends the session on its own.
 */
export function sessionEnded(now: number, lastActiveAt: number | null, signedInAt: number | null): SessionEnd {
  if (signedInAt !== null && now - signedInAt >= SESSION_MAX_AGE_MS) return 'max_age'
  if (lastActiveAt !== null && now - lastActiveAt >= SESSION_IDLE_TIMEOUT_MS) return 'idle'
  return null
}

/** What the browser timer should show at `now`. */
export function idleState(now: number, lastActivityAt: number, signedInAt: number | null): 'active' | 'warning' | 'expired' {
  if (sessionEnded(now, lastActivityAt, signedInAt)) return 'expired'
  const idleFor = now - lastActivityAt
  if (idleFor >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_MS) return 'warning'
  return 'active'
}

/** Seconds left before the idle sign-out (never negative). */
export function secondsUntilIdleSignOut(now: number, lastActivityAt: number): number {
  return Math.max(0, Math.ceil((lastActivityAt + SESSION_IDLE_TIMEOUT_MS - now) / 1000))
}

/**
 * When this sign-in happened (ms since epoch), from the access token's `amr`
 * claim — Supabase keeps the original sign-in time there across token
 * refreshes. Null when the token can't be read.
 */
export function signedInAtFromAccessToken(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null
  const part = accessToken.split('.')[1]
  if (!part) return null
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')))
    const stamps = Array.isArray(json.amr)
      ? json.amr.map((a: { timestamp?: unknown }) => Number(a?.timestamp)).filter((t: number) => Number.isFinite(t) && t > 0)
      : []
    if (!stamps.length) return null
    return Math.min(...stamps) * 1000
  } catch {
    return null
  }
}
