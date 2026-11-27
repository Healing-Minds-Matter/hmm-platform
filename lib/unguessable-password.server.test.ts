import { describe, expect, it, vi } from 'vitest'
import { checkPasswordRules } from '@/lib/password-validation'

vi.mock('server-only', () => ({}))
import { unguessablePassword } from '@/lib/unguessable-password.server'

// Fix A: the random password set on new accounts and when a set-password link
// is sent must always pass the password rules (upper, lower, digit, symbol,
// length). Before, the set-password step had no symbol about 1 time in 8.
describe('unguessablePassword', () => {
  it('passes every password rule, every time (10,000 tries)', () => {
    for (let i = 0; i < 10_000; i++) {
      const pw = unguessablePassword()
      const rules = checkPasswordRules(pw)
      expect(Object.entries(rules).filter(([, ok]) => !ok), pw).toEqual([])
    }
  })

  it('is long and different each time', () => {
    const seen = new Set(Array.from({ length: 1_000 }, () => unguessablePassword()))
    expect(seen.size).toBe(1_000)
    for (const pw of seen) expect(pw.length).toBeGreaterThanOrEqual(64)
  })
})
