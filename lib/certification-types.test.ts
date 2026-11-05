import { describe, expect, it } from 'vitest'
import {
  describeAudit,
  describeTypeError,
  formatCertDate,
  isRealDate,
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
    expect(validateTypeForm(base, TODAY)).toEqual({
      fields: { name: 'Psychological First Aid', code: 'PFA', description: null, issuing_body: null, validity_value: 2, validity_unit: 'years', offered_from: '2025-01-01' },
      until: null,
      retireOption: 'keep',
    })
  })

  it('lifetime types have no validity length', () => {
    const r = validateTypeForm({ ...base, validity_kind: 'lifetime', validity_value: '5' }, TODAY)
    expect(r).toMatchObject({ fields: { validity_value: null, validity_unit: null } })
  })

  it('refuses a missing name or code, and codes with other characters or over 12 long', () => {
    expect(validateTypeForm({ ...base, name: ' ' }, TODAY)).toEqual({ error: 'Enter a name.' })
    expect(validateTypeForm({ ...base, code: '' }, TODAY)).toEqual({ error: 'Enter a code.' })
    expect(validateTypeForm({ ...base, code: 'PF A' }, TODAY)).toEqual({ error: 'The code can only use letters, numbers and hyphens.' })
    expect(validateTypeForm({ ...base, code: 'ABCDEFGHIJKLM' }, TODAY)).toEqual({ error: 'The code can be at most 12 characters.' })
  })

  it('refuses a fixed validity outside 1–120 or without a unit', () => {
    expect(validateTypeForm({ ...base, validity_value: '0' }, TODAY)).toMatchObject({ error: expect.stringContaining('between 1 and 120') })
    expect(validateTypeForm({ ...base, validity_value: '1.5' }, TODAY)).toMatchObject({ error: expect.stringContaining('between 1 and 120') })
    expect(validateTypeForm({ ...base, validity_unit: 'weeks' }, TODAY)).toEqual({ error: 'Choose months or years.' })
    expect(validateTypeForm({ ...base, validity_kind: '' }, TODAY)).toEqual({ error: 'Choose a validity.' })
  })

  it('needs a real Offered from date', () => {
    expect(validateTypeForm({ ...base, offered_from: '2025-02-30' }, TODAY)).toMatchObject({ error: expect.stringContaining('offered from') })
  })

  it('Offered until: optional, today or later, after Offered from, with the chosen option', () => {
    expect(validateTypeForm({ ...base, offered_until: '2027-06-30', retire_option: 'stop' }, TODAY)).toMatchObject({ until: '2027-06-30', retireOption: 'stop' })
    expect(validateTypeForm({ ...base, offered_until: '2026-01-01' }, TODAY)).toMatchObject({ error: expect.stringContaining('today or later') })
    expect(validateTypeForm({ ...base, offered_from: '2027-01-01', offered_until: '2026-12-01' }, TODAY)).toMatchObject({ error: 'Offered until must be after Offered from.' })
  })

  it('keeps an unchanged past date, and ignores the field once the type has retired', () => {
    expect(validateTypeForm({ ...base, offered_until: '2026-01-01' }, TODAY, { currentUntil: '2026-01-01' })).toMatchObject({ until: '2026-01-01' })
    expect(validateTypeForm({ ...base, offered_until: '' }, TODAY, { untilLocked: true, currentUntil: '2025-12-31' })).toMatchObject({ until: '2025-12-31' })
  })
})

describe('retire and reactivate dates', () => {
  it('retirement: today or later, unless it has already happened', () => {
    expect(validateRetirement(TODAY, TODAY)).toBeNull()
    expect(validateRetirement('2026-11-02', TODAY)).toBe('The retirement date must be today or later.')
    expect(validateRetirement('', TODAY)).toBe('Enter the retirement date.')
    expect(validateRetirement('2020-01-01', TODAY, { locked: true })).toBeNull()
  })

  it('reactivation: from today or later, optional until after it', () => {
    expect(validateReactivation(TODAY, '', TODAY)).toBeNull()
    expect(validateReactivation('2026-11-01', '', TODAY)).toBe('Choose today or a later date.')
    expect(validateReactivation(TODAY, TODAY, TODAY)).toBe('Offered until must be after the date it’s offered again.')
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

  it('status badge', () => {
    expect(typeStatusBadge({ status: 'active', offered_until: null, returns_on: null })).toEqual({ label: 'Active', tone: 'ok' })
    expect(typeStatusBadge({ status: 'retiring', offered_until: '2027-06-30', returns_on: null })).toEqual({ label: 'Active · retires 30 Jun 2027', tone: 'warn' })
    expect(typeStatusBadge({ status: 'retired', offered_until: '2025-12-31', returns_on: '2026-12-01' })).toEqual({ label: 'Retired · returns 1 Dec 2026', tone: 'grey' })
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
    expect(describeTypeError({ code: '23514', message: 'The code can’t be changed: this type has already been awarded.' })).toBe('The code can’t be changed: this type has already been awarded.')
    expect(describeTypeError({ code: '42P01', message: 'relation does not exist' })).toBe('Something went wrong. Please try again.')
    expect(describeTypeError({ message: 'new row violates row-level security policy for table "x"' })).toBe('You don’t have permission to do that.')
  })
})

describe('describeAudit', () => {
  it('describes type, retirement and certificate entries', () => {
    expect(describeAudit('certification.type_retired', { retire_on: '2025-12-31', option: 'stop' })).toBe('Retires 31 Dec 2025; existing certificates stop')
    expect(describeAudit('certification.type_created', { code: 'PFA', validity: '2 years', offered_from: '2025-01-01' })).toBe('Code PFA, 2 years, offered from 1 Jan 2025')
    expect(describeAudit('certification.certificate_removed', { type: 'QPR', reason: 'Duplicate record: entered twice' })).toBe('QPR. Reason: Duplicate record: entered twice')
    expect(describeAudit('certification.migrated', { certificates: 74 })).toBe('74 certificates created from the existing QPR certification dates')
  })
  it('words validity and same-day reactivation like the type pages', () => {
    expect(describeAudit('certification.type_created', { code: 'S', validity: '1 months', offered_from: '2024-01-01' })).toBe('Code S, 1 month, offered from 1 Jan 2024')
    expect(describeAudit('certification.type_created', { code: 'L', validity: 'lifetime' })).toBe('Code L, Lifetime (no expiry)')
    expect(describeAudit('certification.type_reactivated', { offered_again_from: '2026-11-04', retired_on: '2026-11-04' }))
      .toBe('Retired and reactivated on the same day (4 Nov 2026), so the retirement was cancelled and no certificates stayed stopped')
    expect(describeAudit('certification.type_reactivated', { offered_again_from: '2026-12-01', retired_on: '2026-11-04' })).toBe('Offered again from 1 Dec 2026 (retired 4 Nov 2026)')
  })
})
