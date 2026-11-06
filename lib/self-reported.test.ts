import { describe, expect, it } from 'vitest'
import { reviewFilterFrom, selfExpiryLabel, validateSelfRemoval, validateSelfReported } from '@/lib/self-reported'

const TODAY = '2026-11-03'
const ok = { name: ' First Aid ', organisation: ' Red Cross ', achievedOn: '2026-01-10', noExpiry: false, expiresOn: '2028-01-10' }

describe('validateSelfReported', () => {
  it('accepts a valid certification and trims it', () => {
    expect(validateSelfReported(ok, TODAY)).toEqual({ fields: { name: 'First Aid', organisation: 'Red Cross', achieved_on: '2026-01-10', expires_on: '2028-01-10' } })
  })
  it('No expiry ignores the expiry date', () => {
    expect(validateSelfReported({ ...ok, noExpiry: true, expiresOn: '' }, TODAY)).toEqual({ fields: expect.objectContaining({ expires_on: null }) })
  })
  it('refuses missing fields, a future date and an expiry before the date achieved', () => {
    expect(validateSelfReported({ ...ok, name: ' ' }, TODAY)).toEqual({ error: 'Enter the certification name.' })
    expect(validateSelfReported({ ...ok, organisation: '' }, TODAY)).toEqual({ error: 'Enter the issuing organisation.' })
    expect(validateSelfReported({ ...ok, achievedOn: '' }, TODAY)).toEqual({ error: 'Enter the date achieved.' })
    expect(validateSelfReported({ ...ok, achievedOn: '2026-11-04' }, TODAY)).toEqual({ error: 'The date achieved can’t be in the future.' })
    expect(validateSelfReported({ ...ok, expiresOn: '' }, TODAY)).toEqual({ error: 'Enter the expiry date, or choose No expiry.' })
    expect(validateSelfReported({ ...ok, expiresOn: '2026-01-09' }, TODAY)).toEqual({ error: 'The expiry date can’t be before the date achieved.' })
  })
})

describe('review rules and labels', () => {
  it('removal needs a listed reason and 10+ characters', () => {
    expect(validateSelfRemoval('Bad', 'a long enough reason')).toBe('Choose a reason.')
    expect(validateSelfRemoval('Other', 'short')).toMatch(/at least 10/)
    expect(validateSelfRemoval('Not a recognised certification', 'Not on the list we accept.')).toBeNull()
  })
  it('expiry labels and filters', () => {
    expect(selfExpiryLabel(null, TODAY)).toBe('No expiry')
    expect(selfExpiryLabel('2026-11-02', TODAY)).toBe('Expired 2 Nov 2026')
    expect(selfExpiryLabel('2026-11-03', TODAY)).toBe('Valid until 3 Nov 2026')
    expect(reviewFilterFrom('verified')).toBe('verified')
    expect(reviewFilterFrom('nonsense')).toBe('waiting')
    expect(reviewFilterFrom(undefined)).toBe('waiting')
  })
})
