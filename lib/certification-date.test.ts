import { describe, expect, it } from 'vitest'
import { FUTURE_DATE_MESSAGE, validateCertificationDate } from '@/lib/certification-date'

describe('validateCertificationDate', () => {
  it('accepts a blank date: the member is not certified yet', () => {
    expect(validateCertificationDate(null)).toBeNull()
    expect(validateCertificationDate(undefined)).toBeNull()
    expect(validateCertificationDate('')).toBeNull()
    expect(validateCertificationDate('   ')).toBeNull()
  })

  it('still checks a date that is given', () => {
    expect(validateCertificationDate('2025-06-01')).toBeNull()
    expect(validateCertificationDate('01/06/2025')).toBe('Certification date must be a valid date in YYYY-MM-DD format.')
    expect(validateCertificationDate('2025-02-30')).toBe('Certification date must be a valid date in YYYY-MM-DD format.')
    expect(validateCertificationDate('2999-01-01')).toBe(FUTURE_DATE_MESSAGE)
  })
})
