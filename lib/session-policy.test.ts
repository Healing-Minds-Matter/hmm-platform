import { describe, expect, it } from 'vitest'
import {
  SESSION_IDLE_TIMEOUT_MS, SESSION_MAX_AGE_MS, SESSION_WARNING_MS,
  idleState, secondsUntilIdleSignOut, sessionEnded, signedInAtFromAccessToken,
} from '@/lib/session-policy'

const MIN = 60_000
const T0 = Date.UTC(2026, 10, 6, 4, 0, 0)

describe('session values (sheet row 5)', () => {
  it('are 30 minutes idle, a 2-minute warning and a 12-hour maximum', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * MIN)
    expect(SESSION_WARNING_MS).toBe(2 * MIN)
    expect(SESSION_MAX_AGE_MS).toBe(12 * 60 * MIN)
  })
})

describe('idleState (browser timer)', () => {
  it('is active until 28 minutes idle', () => {
    expect(idleState(T0 + 27 * MIN, T0, T0)).toBe('active')
  })
  it('warns from 28 minutes, 2 minutes before the sign-out', () => {
    expect(idleState(T0 + 28 * MIN, T0, T0)).toBe('warning')
    expect(secondsUntilIdleSignOut(T0 + 28 * MIN, T0)).toBe(120)
  })
  it('signs out at 30 minutes idle', () => {
    expect(idleState(T0 + 30 * MIN, T0, T0)).toBe('expired')
    expect(secondsUntilIdleSignOut(T0 + 31 * MIN, T0)).toBe(0)
  })
  it('activity (incl. "Stay signed in") restarts the 30 minutes', () => {
    const activeAgain = T0 + 29 * MIN
    expect(idleState(T0 + 40 * MIN, activeAgain, T0)).toBe('active')
  })
  it('signs out after 12 hours even while active', () => {
    const now = T0 + 12 * 60 * MIN
    expect(idleState(now, now - 1000, T0)).toBe('expired')
    expect(idleState(now - MIN, now - MIN, T0)).toBe('active')
  })
})

describe('sessionEnded (server check in middleware)', () => {
  it('reports idle and maximum-age endings', () => {
    expect(sessionEnded(T0 + 30 * MIN, T0, T0)).toBe('idle')
    expect(sessionEnded(T0 + 12 * 60 * MIN, T0 + 12 * 60 * MIN - 1, T0)).toBe('max_age')
    expect(sessionEnded(T0 + 5 * MIN, T0, T0)).toBeNull()
  })
  it('never ends a session for a missing value alone', () => {
    expect(sessionEnded(T0 + 99 * 60 * MIN, null, null)).toBeNull()
  })
})

describe('signedInAtFromAccessToken', () => {
  const token = (payload: object) =>
    `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`

  it('reads the earliest amr sign-in time', () => {
    expect(signedInAtFromAccessToken(token({ amr: [{ method: 'password', timestamp: 1_700_000_100 }, { method: 'otp', timestamp: 1_700_000_000 }] })))
      .toBe(1_700_000_000_000)
  })
  it('is null for a missing or unreadable token', () => {
    expect(signedInAtFromAccessToken(null)).toBeNull()
    expect(signedInAtFromAccessToken('garbage')).toBeNull()
    expect(signedInAtFromAccessToken(token({ sub: 'u' }))).toBeNull()
  })
})
