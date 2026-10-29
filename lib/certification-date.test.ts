import { describe, expect, it } from 'vitest'
import { FUTURE_DATE_MESSAGE, validateCertificationDate } from '@/lib/certification-date'
import { qprStatus } from '@/app/(dashboard)/super-admin/gatekeepers/gatekeeper-status'

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

describe('qprStatus', () => {
  const today = '2026-10-29'
  const in90Days = '2027-01-27'

  it('shows a member with no certification as Not Certified, not Expired', () => {
    expect(qprStatus(true, null, today, in90Days)).toBe('not_certified')
  })

  it('keeps the other statuses', () => {
    expect(qprStatus(true, '2028-06-01', today, in90Days)).toBe('active')
    expect(qprStatus(true, '2026-12-01', today, in90Days)).toBe('expiring_soon')
    expect(qprStatus(true, '2026-01-01', today, in90Days)).toBe('expired')
    expect(qprStatus(false, null, today, in90Days)).toBe('inactive')
  })
})
