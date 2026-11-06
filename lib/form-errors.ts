// Field-level form errors (sheet row 32). Server actions say which field an
// error belongs to; forms show it next to that field (components/field-error.tsx)
// and move focus to the first field with an error (hooks/use-form-errors.ts).

export type FieldErrors = Record<string, string>

/** What a form action returns on a failed save. */
export type FormErrorState = { error?: string; fieldErrors?: FieldErrors }

/** A failed save caused by one field. `field` is the input's `name`. */
export function invalid<F extends string>(field: F, error: string): { error: string; fieldErrors: FieldErrors } {
  return { error, fieldErrors: { [field]: error } }
}

/** The error to show at the top of the form: only one not tied to a field. */
export function formLevelError(state: FormErrorState | null | undefined): string | undefined {
  if (!state?.error) return undefined
  if (state.fieldErrors && Object.keys(state.fieldErrors).length) return undefined
  return state.error
}

export type ValidityLike = Pick<ValidityState,
  'valueMissing' | 'typeMismatch' | 'patternMismatch' | 'tooShort' | 'tooLong' | 'rangeUnderflow' | 'rangeOverflow' | 'stepMismatch' | 'badInput' | 'valid'>

export type FieldLike = {
  type: string
  validity: ValidityLike
  min?: string
  max?: string
  minLength?: number
  maxLength?: number
  title?: string
  validationMessage?: string
}

/** A plain-English message for a field the browser says is invalid. */
export function validityMessage(field: FieldLike, label: string): string | null {
  const v = field.validity
  if (v.valid) return null
  const name = label || 'This field'
  if (v.valueMissing) {
    if (field.type === 'checkbox') return `Please tick ${name.toLowerCase()}.`
    if (field.type === 'radio' || field.type.startsWith('select')) return `Please choose ${name.toLowerCase()}.`
    if (field.type === 'file') return `Please choose a file for ${name.toLowerCase()}.`
    return `${name} is required.`
  }
  if (v.typeMismatch) {
    if (field.type === 'email') return 'Enter a valid email address, e.g. name@example.com.'
    if (field.type === 'url') return 'Enter a full web address, starting with https://.'
    return `${name} isn't in the right format.`
  }
  if (v.badInput) return `${name} isn't valid.`
  if (v.tooShort) return `${name} must be at least ${field.minLength} characters.`
  if (v.tooLong) return `${name} must be ${field.maxLength} characters or fewer.`
  if (v.rangeUnderflow) return field.type.startsWith('date') ? `${name} can't be before ${field.min}.` : `${name} must be ${field.min} or more.`
  if (v.rangeOverflow) return field.type.startsWith('date') ? `${name} can't be after ${field.max}.` : `${name} must be ${field.max} or less.`
  if (v.patternMismatch) return field.title || `${name} isn't in the right format.`
  return field.validationMessage || `${name} isn't valid.`
}

/** Label text without the required-field asterisk. */
export function cleanLabel(text: string | null | undefined): string {
  return (text ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}
