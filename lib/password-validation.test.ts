import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, checkPasswordRules, validatePassword } from '@/lib/password-validation'

// Review Finding 8: passwords are at least 12 characters (Supabase is set to
// the same minimum, so the web, the app and Supabase agree).

describe('password minimum length', () => {
  it('is 12', () => expect(PASSWORD_MIN_LENGTH).toBe(12))
  it('11 characters → refused with a clear message', () => {
    const r = validatePassword('Kandy!Lake4')
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('At least 12 characters long')
    expect(checkPasswordRules('Kandy!Lake4').minLength).toBe(false)
  })
  it('12 characters with every rule met → accepted', () => {
    expect(validatePassword('Kandy!Lake42')).toEqual({ valid: true, errors: [] })
    expect(checkPasswordRules('Kandy!Lake42').minLength).toBe(true)
  })
})
