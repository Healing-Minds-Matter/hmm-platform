import { describe, expect, it } from 'vitest'
import { byHolder, certChipText, certificationFigures, certifiedFigures, matchesCertFilter, personCertStatus, type CurrentCert } from '@/lib/cert-summary'

const c = (holder: string, type: string, status: CurrentCert['status'], expires: string | null = '2027-01-01'): CurrentCert =>
  ({ id: `${holder}-${type}`, holder_id: holder, type_id: type, status, achieved_on: '2024-01-01', expires_on: expires })

describe('personCertStatus', () => {
  it('gives one status across every type, with no type special-cased', () => {
    expect(personCertStatus(false, [c('a', 't1', 'valid')])).toBe('inactive')
    expect(personCertStatus(true, undefined)).toBe('none')
    expect(personCertStatus(true, [])).toBe('none')
    expect(personCertStatus(true, [c('a', 't1', 'valid')])).toBe('certified')
    expect(personCertStatus(true, [c('a', 't1', 'expiring_soon')])).toBe('expiring_soon')
    expect(personCertStatus(true, [c('a', 't1', 'expired')])).toBe('expired')
    expect(personCertStatus(true, [c('a', 't1', 'stopped')])).toBe('expired')
  })

  it('uses the best certificate the person holds, whatever its type', () => {
    expect(personCertStatus(true, [c('a', 't1', 'expired'), c('a', 't2', 'valid')])).toBe('certified')
    expect(personCertStatus(true, [c('a', 't1', 'expired'), c('a', 't2', 'expiring_soon')])).toBe('expiring_soon')
    expect(personCertStatus(true, [c('a', 't1', 'expiring_soon'), c('a', 't2', 'valid')])).toBe('certified')
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
    // a: valid; b: expiring soon (its other one is stopped); c: none; x: out of scope.
    expect(certifiedFigures(byHolder(rows), ['a', 'b', 'c'])).toEqual({ certified: 2, expiringSoon: 1, total: 3 })
    // Any type counts: a person certified only in a non-first type is still certified.
    expect(certifiedFigures(byHolder([c('d', 'pfa', 'valid')]), ['d'])).toEqual({ certified: 1, expiringSoon: 0, total: 1 })
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
