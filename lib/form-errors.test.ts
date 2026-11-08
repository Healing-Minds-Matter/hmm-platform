import { describe, expect, it } from 'vitest'
import { cleanLabel, formLevelError, invalid, validityMessage, type ValidityLike } from '@/lib/form-errors'

const ok: ValidityLike = {
  valueMissing: false, typeMismatch: false, patternMismatch: false, tooShort: false, tooLong: false,
  rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false, valid: true,
}
const bad = (k: keyof ValidityLike): ValidityLike => ({ ...ok, valid: false, [k]: true })

describe('invalid / formLevelError (sheet row 32)', () => {
  it('ties a server error to its field', () => {
    expect(invalid('title', 'Title is required.')).toEqual({ error: 'Title is required.', fieldErrors: { title: 'Title is required.' } })
  })
  it('only shows field-less errors at the top of the form', () => {
    expect(formLevelError(invalid('title', 'x'))).toBeUndefined()
    expect(formLevelError({ error: 'Something went wrong.' })).toBe('Something went wrong.')
    expect(formLevelError(null)).toBeUndefined()
  })
})

describe('validityMessage', () => {
  it('names the field in plain English', () => {
    expect(validityMessage({ type: 'text', validity: bad('valueMissing') }, 'Club Name')).toBe('Club Name is required.')
    expect(validityMessage({ type: 'select-one', validity: bad('valueMissing') }, 'Club')).toBe('Club is required.')
    expect(validityMessage({ type: 'email', validity: bad('typeMismatch') }, 'Email')).toBe('Enter a valid email address, e.g. name@example.com.')
    expect(validityMessage({ type: 'url', validity: bad('typeMismatch') }, 'Link')).toBe('Enter a full web address, starting with https://.')
    expect(validityMessage({ type: 'date', min: '2026-11-06', validity: bad('rangeUnderflow') }, 'Publish date')).toBe("Publish date can't be before 2026-11-06.")
    expect(validityMessage({ type: 'text', minLength: 8, validity: bad('tooShort') }, 'Password')).toBe('Password must be at least 8 characters.')
    expect(validityMessage({ type: 'text', title: 'Use letters only.', validity: bad('patternMismatch') }, 'Code')).toBe('Use letters only.')
  })
  it('returns null for a valid field', () => {
    expect(validityMessage({ type: 'text', validity: ok }, 'x')).toBeNull()
  })
  it('cleans the required-field asterisk from labels', () => {
    expect(cleanLabel(' Club Name  * ')).toBe('Club Name')
  })
})
