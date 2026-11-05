// Certification types (Epic 10, Stories 10.1 and 10.2): form rules, labels and
// friendly error messages. Pure functions, shared by the pages and the server
// actions. The database (migration 20261103000000) enforces the same rules;
// these give a clear message before a save is attempted.

export type ValidityUnit = 'months' | 'years'
export type RetirementOption = 'keep' | 'stop'
export type TypeStatus = 'active' | 'retiring' | 'retired'

// A row of the certification_type_statuses view.
export type CertificationTypeRow = {
  id: string
  name: string
  code: string
  description: string | null
  issuing_body: string | null
  validity_value: number | null
  validity_unit: ValidityUnit | null
  offered_from: string
  created_from_existing: boolean
  status: TypeStatus
  open_retirement_id: string | null
  offered_until: string | null
  retirement_option: RetirementOption | null
  returns_on: string | null
}

export const TYPE_COLUMNS =
  'id, name, code, description, issuing_body, validity_value, validity_unit, offered_from, created_from_existing, status, open_retirement_id, offered_until, retirement_option, returns_on'

export type TypeFields = {
  name: string
  code: string
  description: string | null
  issuing_body: string | null
  validity_value: number | null
  validity_unit: ValidityUnit | null
  offered_from: string
}

export type TypeFormInput = {
  name?: string | null
  code?: string | null
  description?: string | null
  issuing_body?: string | null
  validity_kind?: string | null      // 'lifetime' | 'fixed'
  validity_value?: string | null
  validity_unit?: string | null
  offered_from?: string | null
  offered_until?: string | null
  retire_option?: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

// Validates the New / Edit certification type form.
// `until` is the Offered until (retirement) date; `untilLocked` is true when the
// type has already retired, so the date can no longer change.
export function validateTypeForm(
  input: TypeFormInput,
  today: string,
  opts: { untilLocked?: boolean; currentUntil?: string | null } = {}
): { fields: TypeFields; until: string | null; retireOption: RetirementOption } | { error: string } {
  const name = clean(input.name)
  const code = clean(input.code).toUpperCase()
  if (!name) return { error: 'Enter a name.' }
  if (name.length > 120) return { error: 'The name can be at most 120 characters.' }
  if (!code) return { error: 'Enter a code.' }
  if (!/^[A-Z0-9-]+$/.test(code)) return { error: 'The code can only use letters, numbers and hyphens.' }
  if (code.length > 12) return { error: 'The code can be at most 12 characters.' }

  let validity_value: number | null = null
  let validity_unit: ValidityUnit | null = null
  if (clean(input.validity_kind) === 'fixed') {
    const n = Number(clean(input.validity_value))
    if (!Number.isInteger(n) || n < 1 || n > 120) return { error: 'Enter a validity between 1 and 120.' }
    const unit = clean(input.validity_unit)
    if (unit !== 'months' && unit !== 'years') return { error: 'Choose months or years.' }
    validity_value = n
    validity_unit = unit
  } else if (clean(input.validity_kind) !== 'lifetime') {
    return { error: 'Choose a validity.' }
  }

  const offered_from = clean(input.offered_from)
  if (!isRealDate(offered_from)) return { error: 'Enter the date it’s offered from.' }

  let until: string | null = opts.untilLocked ? (opts.currentUntil ?? null) : clean(input.offered_until) || null
  if (!opts.untilLocked && until) {
    if (!isRealDate(until)) return { error: 'Enter a real Offered until date.' }
    if (until !== opts.currentUntil && until < today) return { error: 'Offered until must be today or later. To retire a type straight away, use Retire type.' }
    if (until <= offered_from) return { error: 'Offered until must be after Offered from.' }
  }
  if (!until) until = null

  const option = clean(input.retire_option)
  const retireOption: RetirementOption = option === 'stop' ? 'stop' : 'keep'

  return {
    fields: {
      name,
      code,
      description: clean(input.description) || null,
      issuing_body: clean(input.issuing_body) || null,
      validity_value,
      validity_unit,
      offered_from,
    },
    until,
    retireOption,
  }
}

export function validateRetirement(retireOn: string, today: string, opts: { locked?: boolean } = {}): string | null {
  if (opts.locked) return null
  if (!isRealDate(retireOn)) return 'Enter the retirement date.'
  if (retireOn < today) return 'The retirement date must be today or later.'
  return null
}

export function validateReactivation(from: string, until: string, today: string): string | null {
  if (!isRealDate(from)) return 'Enter the date it’s offered again from.'
  if (from < today) return 'Choose today or a later date.'
  if (until) {
    if (!isRealDate(until)) return 'Enter a real Offered until date.'
    if (until <= from) return 'Offered until must be after the date it’s offered again.'
  }
  return null
}

// ── Labels ───────────────────────────────────────────────────────────────────
export function validityLabel(t: Pick<CertificationTypeRow, 'validity_value' | 'validity_unit'>): string {
  if (t.validity_value == null || !t.validity_unit) return 'Lifetime (no expiry)'
  const unit = t.validity_value === 1 ? t.validity_unit.slice(0, -1) : t.validity_unit
  return `${t.validity_value} ${unit}`
}

// "2 Nov 2026". Dates here are plain calendar dates (YYYY-MM-DD), so they're
// formatted from their parts: no time zone shift, and the same month
// abbreviations everywhere (locale formats differ, e.g. en-AU writes "June").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function formatCertDate(date: string | null | undefined): string {
  if (!date) return ''
  const [y, m, day] = date.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS[m - 1]} ${y}`
}

export function typeStatusBadge(t: Pick<CertificationTypeRow, 'status' | 'offered_until' | 'returns_on'>): { label: string; tone: 'ok' | 'warn' | 'grey' } {
  if (t.status === 'retired') {
    return { label: t.returns_on ? `Retired · returns ${formatCertDate(t.returns_on)}` : 'Retired', tone: 'grey' }
  }
  if (t.status === 'retiring' && t.offered_until) return { label: `Active · retires ${formatCertDate(t.offered_until)}`, tone: 'warn' }
  return { label: 'Active', tone: 'ok' }
}

export function retirementEffect(option: RetirementOption, lifetime: boolean): string {
  return option === 'stop'
    ? 'Stop being valid on the retirement date.'
    : `Stay valid until their own expiry date${lifetime ? ' (for life)' : ''}.`
}

// ── Errors from the database ─────────────────────────────────────────────────
export function describeTypeError(error: { code?: string; message?: string } | null, fields?: Pick<TypeFields, 'name' | 'code'>): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code === '23505') {
    const msg = error.message ?? ''
    if (msg.includes('certification_types_code_key')) return `The code “${fields?.code ?? ''}” is already used by another type.`
    if (msg.includes('certification_types_name_key')) return `There’s already a type called “${fields?.name ?? ''}”.`
    if (msg.includes('certification_type_retirements_one_open')) return 'This type already has a retirement date. Change it from the type’s page.'
    return 'That name or code is already used.'
  }
  // Rule and permission messages raised by the database are written for people.
  if (error.code === '23514' || error.code === '42501' || error.code === 'P0001') return error.message ?? 'That change isn’t allowed.'
  if ((error.message ?? '').includes('row-level security')) return 'You don’t have permission to do that.'
  return 'Something went wrong. Please try again.'
}

// ── Audit history (Story 10.16) ──────────────────────────────────────────────
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'certification.migrated': 'Moved from old QPR dates',
  'certification.type_created': 'Type created',
  'certification.type_edited': 'Type edited',
  'certification.type_retired': 'Type retired',
  'certification.retirement_changed': 'Retirement changed',
  'certification.retirement_cancelled': 'Retirement cancelled',
  'certification.type_reactivated': 'Type reactivated',
  'certification.design_saved': 'Design saved',
  'certification.certificate_added': 'Certificate added',
  'certification.certificate_renewed': 'Certificate renewed',
  'certification.certificate_edited': 'Certificate edited',
  'certification.certificate_removed': 'Certificate removed',
  'certification.removal_undone': 'Removal undone',
  'certification.self_reported_added': 'Self-reported added',
  'certification.self_reported_edited': 'Self-reported edited',
  'certification.self_reported_verified': 'Self-reported verified',
  'certification.self_reported_removed': 'Self-reported removed',
  'certification.self_reported_withdrawn': 'Self-reported withdrawn',
}

export function auditTone(action: string): 'info' | 'ok' | 'warn' | 'bad' | 'grey' {
  if (/removed|retired/.test(action)) return 'bad'
  if (/withdrawn|migrated/.test(action)) return 'grey'
  if (/edited|undone|reactivated|changed|cancelled/.test(action)) return 'warn'
  if (/renewed|verified/.test(action)) return 'ok'
  return 'info'
}

const optionWord = (o: unknown) => (o === 'stop' ? 'existing certificates stop' : 'existing certificates stay valid')
const d = (v: unknown) => (typeof v === 'string' ? formatCertDate(v) : '')
// The database records validity as "3 years", "1 months" or "lifetime"; shown
// with the same words as the type pages (validityLabel).
function validityText(v: unknown): string {
  if (v === 'lifetime') return validityLabel({ validity_value: null, validity_unit: null })
  const m = typeof v === 'string' ? v.match(/^(\d+) (months|years)$/) : null
  return m ? validityLabel({ validity_value: Number(m[1]), validity_unit: m[2] as ValidityUnit }) : typeof v === 'string' ? v : ''
}

export function describeAudit(action: string, details: Record<string, unknown> | null): string {
  const x = details ?? {}
  switch (action) {
    case 'certification.migrated':
      return `${x.certificates ?? 0} certificates created from the existing QPR certification dates`
    case 'certification.type_created':
    case 'certification.type_edited':
      return [`Code ${x.code}`, validityText(x.validity), x.offered_from ? `offered from ${d(x.offered_from)}` : ''].filter(Boolean).join(', ')
    case 'certification.type_retired':
      return `Retires ${d(x.retire_on)}; ${optionWord(x.option)}`
    case 'certification.retirement_changed':
      return `Retires ${d(x.retire_on)}; ${optionWord(x.option)}${x.previous_option && x.previous_option !== x.option ? ` (was: ${optionWord(x.previous_option)})` : ''}`
    case 'certification.retirement_cancelled':
      return `The retirement planned for ${d(x.retired_on)} was cancelled`
    case 'certification.type_reactivated':
      // Same wording as the type's Retirement history.
      return x.offered_again_from && x.offered_again_from === x.retired_on
        ? `Retired and reactivated on the same day (${d(x.retired_on)}), so the retirement was cancelled and no certificates stayed stopped`
        : `Offered again from ${d(x.offered_again_from)} (retired ${d(x.retired_on)})`
    case 'certification.design_saved':
      return `Version ${x.version}`
    case 'certification.certificate_added':
    case 'certification.certificate_renewed':
      return [x.type, x.achieved_on ? `achieved ${d(x.achieved_on)}` : '', x.certificate_number ? `certificate ${x.certificate_number}` : '', x.from_old_form ? 'from the Gatekeeper form' : ''].filter(Boolean).join(', ')
    case 'certification.certificate_edited':
      return [x.type, x.reason ? `Reason: ${x.reason}` : x.from_old_form ? 'from the Gatekeeper form' : ''].filter(Boolean).join('. ')
    case 'certification.certificate_removed':
      return `${x.type}. Reason: ${x.reason}`
    case 'certification.removal_undone':
      return `${x.type}; it had been removed (${x.was_removed_for})`
    case 'certification.self_reported_added':
      return `${x.name}${x.organisation ? ` (${x.organisation})` : ''}`
    case 'certification.self_reported_removed':
      return `${x.name}. Reason: ${x.reason}`
    default:
      return typeof x.name === 'string' ? x.name : ''
  }
}
