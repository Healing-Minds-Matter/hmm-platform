import { describe, expect, it } from 'vitest'
import {
  TYPE_TEXT,
  describeAudit,
  describeTypeError,
  formatCertDate,
  isRealDate,
  issuedBanner,
  lastAwardDate,
  programmeEnded,
  programmePeriodLabel,
  typeStatusBadge,
  validateReactivation,
  validateRetirement,
  validateTypeForm,
  validityLabel,
} from '@/lib/certification-types'

const TODAY = '2026-11-03'
const base = { name: '  Psychological First Aid ', code: ' pfa ', validity_kind: 'fixed', validity_value: '2', validity_unit: 'years', offered_from: '2025-01-01' }

describe('validateTypeForm', () => {
  it('accepts a valid type, trims, and stores the code in capitals', () => {
    expect(validateTypeForm(base)).toEqual({
      fields: { name: 'Psychological First Aid', code: 'PFA', description: null, issuing_body: null, validity_value: 2, validity_unit: 'years', offered_from: '2025-01-01', offered_until: null },
    })
  })

  it('lifetime types have no validity length', () => {
    const r = validateTypeForm({ ...base, validity_kind: 'lifetime', validity_value: '5' })
    expect(r).toMatchObject({ fields: { validity_value: null, validity_unit: null } })
  })

  it('refuses a missing name or code, and codes with other characters or over 12 long', () => {
    expect(validateTypeForm({ ...base, name: ' ' })).toEqual({ error: 'Enter a name.' })
    expect(validateTypeForm({ ...base, code: '' })).toEqual({ error: 'Enter a code.' })
    expect(validateTypeForm({ ...base, code: 'PF A' })).toEqual({ error: 'The code can only use letters, numbers and hyphens.' })
    expect(validateTypeForm({ ...base, code: 'ABCDEFGHIJKLM' })).toEqual({ error: 'The code can be at most 12 characters.' })
  })

  it('refuses a fixed validity outside 1–120 or without a unit', () => {
    expect(validateTypeForm({ ...base, validity_value: '0' })).toMatchObject({ error: expect.stringContaining('between 1 and 120') })
    expect(validateTypeForm({ ...base, validity_value: '1.5' })).toMatchObject({ error: expect.stringContaining('between 1 and 120') })
    expect(validateTypeForm({ ...base, validity_unit: 'weeks' })).toEqual({ error: 'Choose months or years.' })
    expect(validateTypeForm({ ...base, validity_kind: '' })).toEqual({ error: 'Choose a certificate validity period.' })
  })

  it('needs a real Offered from date', () => {
    expect(validateTypeForm({ ...base, offered_from: '2025-02-30' })).toEqual({ error: 'Enter the date the programme is offered from.' })
  })
})

describe('programme period', () => {
  it('Offered until is optional (blank = no end date)', () => {
    expect(validateTypeForm({ ...base, offered_until: '' })).toMatchObject({ fields: { offered_until: null } })
  })
  it('Offered until can equal Offered from', () => {
    expect(validateTypeForm({ ...base, offered_until: '2025-01-01' })).toMatchObject({ fields: { offered_from: '2025-01-01', offered_until: '2025-01-01' } })
  })
  it('Offered until before Offered from is refused', () => {
    expect(validateTypeForm({ ...base, offered_until: '2024-12-31' })).toEqual({ error: 'Offered until must be on or after Offered from.' })
  })
  it('Offered until can be in the past (it only stops new awards)', () => {
    expect(validateTypeForm({ ...base, offered_until: '2025-06-30' })).toMatchObject({ fields: { offered_until: '2025-06-30' } })
  })
  it('refuses a malformed Offered until', () => {
    expect(validateTypeForm({ ...base, offered_until: '2026-02-30' })).toMatchObject({ error: expect.stringContaining('real Offered until date') })
  })
  it('labels the period for the types list', () => {
    expect(programmePeriodLabel({ offered_from: '2025-01-01', offered_until: null })).toBe('From 1 Jan 2025')
    expect(programmePeriodLabel({ offered_from: '2025-01-01', offered_until: '2026-12-31' })).toBe('1 Jan 2025 – 31 Dec 2026')
  })
  it('knows when the programme has ended, and caps the award date picker', () => {
    expect(programmeEnded({ offered_until: '2026-11-02' }, TODAY)).toBe(true)
    expect(programmeEnded({ offered_until: TODAY }, TODAY)).toBe(false)
    expect(programmeEnded({ offered_until: null }, TODAY)).toBe(false)
    expect(lastAwardDate({ offered_until: '2026-06-30' }, TODAY)).toBe('2026-06-30')
    expect(lastAwardDate({ offered_until: '2027-06-30' }, TODAY)).toBe(TODAY)
    expect(lastAwardDate(null, TODAY)).toBe(TODAY)
  })
})

describe('editing a type that has been issued', () => {
  const current = { code: 'PFA', offered_from: '2025-01-01' }
  const issued = { certificates: 3, people: 2, latestAchievedOn: '2026-05-10' }
  it('Offered from and the code are read-only', () => {
    expect(validateTypeForm({ ...base, offered_from: '2025-02-01' }, { current, issued })).toEqual({ error: 'Offered from can’t be changed because certificates have already been issued.' })
    expect(validateTypeForm({ ...base, code: 'PFA2' }, { current, issued })).toMatchObject({ error: expect.stringContaining('The code can’t be changed because certificates have already been issued') })
    expect(validateTypeForm(base, { current, issued })).toMatchObject({ fields: { code: 'PFA', offered_from: '2025-01-01' } })
  })
  it('a removed certificate still counts as issued', () => {
    const onlyRemoved = { certificates: 1, people: 1, latestAchievedOn: '2025-03-01' }
    expect(validateTypeForm({ ...base, offered_from: '2025-02-01' }, { current, issued: onlyRemoved })).toMatchObject({ error: expect.stringContaining('Offered from can’t be changed') })
  })
  it('Offered until can’t be earlier than the latest date achieved', () => {
    expect(validateTypeForm({ ...base, offered_until: '2026-05-09' }, { current, issued })).toEqual({ error: 'Offered until can’t be earlier than 10 May 2026, the latest date achieved on a certificate of this type.' })
    expect(validateTypeForm({ ...base, offered_until: '2026-05-10' }, { current, issued })).toMatchObject({ fields: { offered_until: '2026-05-10' } })
  })
  it('validity can still change (it applies to new certificates only)', () => {
    expect(validateTypeForm({ ...base, validity_value: '5' }, { current, issued })).toMatchObject({ fields: { validity_value: 5 } })
  })
  it('a type with no certificates can change both', () => {
    const none = { certificates: 0, people: 0, latestAchievedOn: null }
    expect(validateTypeForm({ ...base, code: 'NEW', offered_from: '2025-03-01' }, { current, issued: none })).toMatchObject({ fields: { code: 'NEW', offered_from: '2025-03-01' } })
  })
  it('the banner gives the number of people', () => {
    expect(issuedBanner(4)).toBe('This certification has been issued to 4 people. Changes you make here apply only to certificates issued from now on. Existing certificates keep their dates, numbers and PDFs.')
    expect(issuedBanner(1)).toMatch(/^This certification has been issued to 1 person\./)
  })
})

describe('retire and reactivate dates', () => {
  it('retirement: today or later, unless it has already happened', () => {
    expect(validateRetirement(TODAY, TODAY)).toBeNull()
    expect(validateRetirement('2026-11-02', TODAY)).toBe('The retirement date must be today or later.')
    expect(validateRetirement('', TODAY)).toBe('Enter the retirement date.')
    expect(validateRetirement('2020-01-01', TODAY, { locked: true })).toBeNull()
  })

  it('reactivation: from today or later', () => {
    expect(validateReactivation(TODAY, TODAY)).toBeNull()
    expect(validateReactivation('2026-11-01', TODAY)).toBe('Choose today or a later date.')
  })
})

describe('form wording', () => {
  it('uses the new field names and helper text', () => {
    expect(TYPE_TEXT.validityLabel).toBe('Certificate validity period')
    expect(TYPE_TEXT.validityHint).toBe('How long each certificate stays valid after the date it’s achieved. This applies to certificates issued to Champions and Gatekeepers. Choose Lifetime if the certificate never expires.')
    expect(TYPE_TEXT.periodLabel).toBe('Programme period')
    expect(TYPE_TEXT.periodHint).toBe('The dates this certification programme runs. Certificates can only be issued for this programme within these dates.')
    expect(TYPE_TEXT.offeredFromLabel).toBe('Offered from')
    expect(TYPE_TEXT.offeredUntilLabel).toBe('Offered until')
    expect(TYPE_TEXT.lockedHint).toBe('Can’t be changed because certificates have already been issued.')
  })
})

describe('labels', () => {
  it('validity', () => {
    expect(validityLabel({ validity_value: 3, validity_unit: 'years' })).toBe('3 years')
    expect(validityLabel({ validity_value: 1, validity_unit: 'months' })).toBe('1 month')
    expect(validityLabel({ validity_value: null, validity_unit: null })).toBe('Lifetime (no expiry)')
  })

  it('dates do not shift with the machine’s time zone', () => {
    expect(formatCertDate('2026-11-03')).toBe('3 Nov 2026')
    expect(isRealDate('2026-02-29')).toBe(false)
  })

  it('status badge uses the retirement date, not the programme period', () => {
    expect(typeStatusBadge({ status: 'active', retire_on: null, returns_on: null })).toEqual({ label: 'Active', tone: 'ok' })
    expect(typeStatusBadge({ status: 'retiring', retire_on: '2027-06-30', returns_on: null })).toEqual({ label: 'Active · retires 30 Jun 2027', tone: 'warn' })
    expect(typeStatusBadge({ status: 'retired', retire_on: '2025-12-31', returns_on: '2026-12-01' })).toEqual({ label: 'Retired · returns 1 Dec 2026', tone: 'grey' })
  })
})

describe('describeTypeError', () => {
  it('turns unique-index errors into plain messages', () => {
    expect(describeTypeError({ code: '23505', message: 'duplicate key value violates unique constraint "certification_types_code_key"' }, { name: 'X', code: 'PFA' }))
      .toBe('The code “PFA” is already used by another type.')
    expect(describeTypeError({ code: '23505', message: '… "certification_types_name_key"' }, { name: 'First Aid', code: 'FA' }))
      .toBe('There’s already a type called “First Aid”.')
  })
  it('passes the database’s own rule messages through, and hides raw errors', () => {
    expect(describeTypeError({ code: '23514', message: 'Offered from can’t be changed because certificates have already been issued.' })).toBe('Offered from can’t be changed because certificates have already been issued.')
    expect(describeTypeError({ code: '42P01', message: 'relation does not exist' })).toBe('Something went wrong. Please try again.')
    expect(describeTypeError({ message: 'new row violates row-level security policy for table "x"' })).toBe('You don’t have permission to do that.')
  })
})

describe('describeAudit', () => {
  it('describes type, retirement and certificate entries', () => {
    expect(describeAudit('certification.type_retired', { retire_on: '2025-12-31', option: 'stop' })).toBe('Retires 31 Dec 2025; existing certificates stop')
    expect(describeAudit('certification.type_created', { code: 'PFA', validity: '2 years', offered_from: '2025-01-01' })).toBe('Code PFA, 2 years, offered from 1 Jan 2025')
    expect(describeAudit('certification.type_created', { code: 'PFA', validity: '2 years', offered_from: '2025-01-01', offered_until: '2026-12-31' })).toBe('Code PFA, 2 years, offered from 1 Jan 2025, until 31 Dec 2026')
    expect(describeAudit('certification.certificate_removed', { type: 'QPR', reason: 'Duplicate record: entered twice' })).toBe('QPR. Reason: Duplicate record: entered twice')
    expect(describeAudit('certification.migrated', { certificates: 74 })).toBe('74 certificates created from earlier certification records')
  })
  it('lists each changed field before and after on an edit', () => {
    expect(describeAudit('certification.type_edited', {
      code: 'PFA', validity: '3 years', offered_from: '2025-01-01',
      changes: { validity: { from: '2 years', to: '3 years' }, offered_until: { from: null, to: '2026-12-31' } },
    })).toBe('Certificate validity period: 2 years → 3 years; Offered until: no end date → 31 Dec 2026')
    expect(describeAudit('certification.type_edited', { changes: { issuing_body: { from: null, to: 'QPR Institute' }, validity: { from: '1 months', to: 'lifetime' } } }))
      .toBe('Issuing body: none → QPR Institute; Certificate validity period: 1 month → Lifetime (no expiry)')
  })
  it('older edit entries without before/after still read as before', () => {
    expect(describeAudit('certification.type_edited', { code: 'PFA', validity: '2 years', offered_from: '2025-01-01' })).toBe('Code PFA, 2 years, offered from 1 Jan 2025')
  })
  it('words validity and same-day reactivation like the type pages', () => {
    expect(describeAudit('certification.type_created', { code: 'S', validity: '1 months', offered_from: '2024-01-01' })).toBe('Code S, 1 month, offered from 1 Jan 2024')
    expect(describeAudit('certification.type_created', { code: 'L', validity: 'lifetime' })).toBe('Code L, Lifetime (no expiry)')
    expect(describeAudit('certification.type_reactivated', { offered_again_from: '2026-11-04', retired_on: '2026-11-04' }))
      .toBe('Retired and reactivated on the same day (4 Nov 2026), so the retirement was cancelled and no certificates stayed stopped')
    expect(describeAudit('certification.type_reactivated', { offered_again_from: '2026-12-01', retired_on: '2026-11-04' })).toBe('Offered again from 1 Dec 2026 (retired 4 Nov 2026)')
  })
})
