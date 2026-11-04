import { describe, expect, it } from 'vitest'
import { byHolder, certChipText, certificationFigures, matchesCertFilter, qprFigures, qprStatusOf, type CurrentCert } from '@/lib/cert-summary'

const c = (holder: string, type: string, status: CurrentCert['status'], expires: string | null = '2027-01-01'): CurrentCert =>
  ({ id: `${holder}-${type}`, holder_id: holder, type_id: type, status, achieved_on: '2024-01-01', expires_on: expires })

describe('qprStatusOf', () => {
  it('maps certificate statuses to the existing QPR badges', () => {
    expect(qprStatusOf(false, c('a', 'q', 'valid'))).toBe('inactive')
    expect(qprStatusOf(true, undefined)).toBe('not_certified')
    expect(qprStatusOf(true, c('a', 'q', 'valid'))).toBe('active')
    expect(qprStatusOf(true, c('a', 'q', 'expiring_soon'))).toBe('expiring_soon')
    expect(qprStatusOf(true, c('a', 'q', 'expired'))).toBe('expired')
    expect(qprStatusOf(true, c('a', 'q', 'stopped'))).toBe('expired')
  })
})

describe('matchesCertFilter', () => {
  const certs = [c('a', 'qpr', 'valid'), c('a', 'pfa', 'expired')]
  it('filters by type, by status, both, and none', () => {
    expect(matchesCertFilter(certs, undefined, undefined)).toBe(true)
    expect(matchesCertFilter(certs, 'qpr', undefined)).toBe(true)
    expect(matchesCertFilter(certs, 'other', undefined)).toBe(false)
    expect(matchesCertFilter(certs, 'qpr', 'expired')).toBe(false)
    expect(matchesCertFilter(certs, 'pfa', 'expired')).toBe(true)
    expect(matchesCertFilter(certs, undefined, 'expiring_soon')).toBe(false)
    expect(matchesCertFilter(certs, 'none', undefined)).toBe(false)
    expect(matchesCertFilter([], 'none', undefined)).toBe(true)
  })
})

describe('figures', () => {
  it('counts per type and people with no certifications, only for people in scope', () => {
    const rows = [c('a', 'qpr', 'valid'), c('b', 'qpr', 'expiring_soon'), c('b', 'pfa', 'stopped'), c('x', 'qpr', 'valid')]
    expect(certificationFigures(rows, ['a', 'b', 'c'])).toEqual({
      perType: [
        { typeId: 'qpr', valid: 1, expiringSoon: 1, expired: 0, holders: 2 },
        { typeId: 'pfa', valid: 0, expiringSoon: 0, expired: 1, holders: 1 },
      ],
      withoutCertifications: 1,
    })
    const qpr = new Map([...byHolder(rows.filter(r => r.type_id === 'qpr'))].map(([k, v]) => [k, v[0]]))
    expect(qprFigures(qpr, ['a', 'b', 'c'])).toEqual({ certified: 2, expiringSoon: 1, total: 3 })
  })
})

describe('certChipText', () => {
  it('describes the certificate', () => {
    expect(certChipText(c('a', 'q', 'valid', '2027-03-12'))).toBe('Until 12 Mar 2027')
    expect(certChipText(c('a', 'q', 'expired', '2026-01-02'))).toBe('Expired 2 Jan 2026')
    expect(certChipText(c('a', 'q', 'valid', null))).toBe('Lifetime')
    expect(certChipText(c('a', 'q', 'stopped'))).toBe('Stopped')
    expect(certChipText(c('a', 'q', 'expiring_soon', '2026-11-04'), '2026-11-04')).toBe('Expires today')
  })
})
