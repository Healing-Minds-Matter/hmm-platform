// Certification types (Epic 10, Stories 10.1 and 10.2): form rules, labels and
// friendly error messages. Pure functions, shared by the pages and the server
// actions. The database (migrations 20261103000000 and 20261108000000) enforces
// the same rules; these give a clear message before a save is attempted.

export type ValidityUnit = 'months' | 'years'
export type RetirementOption = 'keep' | 'stop'
export type TypeStatus = 'active' | 'retiring' | 'retired'

// A row of the certification_type_statuses view.
// offered_from / offered_until are the programme period: they only limit new awards.
// retire_on is the open retirement's date (a separate action, with its keep/stop choice).
export type CertificationTypeRow = {
  id: string
  name: string
  code: string
  description: string | null
  issuing_body: string | null
  validity_value: number | null
  validity_unit: ValidityUnit | null
  offered_from: string
  offered_until: string | null
  created_from_existing: boolean
  status: TypeStatus
  open_retirement_id: string | null
  retire_on: string | null
  retirement_option: RetirementOption | null
  returns_on: string | null
}

export const TYPE_COLUMNS =
  'id, name, code, description, issuing_body, validity_value, validity_unit, offered_from, offered_until, created_from_existing, status, open_retirement_id, retire_on, retirement_option, returns_on'

export type TypeFields = {
  name: string
  code: string
  description: string | null
  issuing_body: string | null
  validity_value: number | null
  validity_unit: ValidityUnit | null
  offered_from: string
  offered_until: string | null
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
}

// What's already been issued for a type being edited. Once any certificate exists
// (any status, removed included), the code and Offered from are fixed, and Offered
// until can't be earlier than the latest date achieved.
export type IssuedFacts = {
  certificates: number          // all certificates of the type, removed included
  people: number                // distinct holders of them
  latestAchievedOn: string | null
}

// ── Form wording (shared by the form, the type pages and the tests) ─────────
export const TYPE_TEXT = {
  validityLabel: 'Certificate validity period',
  validityHint: 'How long each certificate stays valid after the date it’s achieved. This applies to certificates issued to Champions and Gatekeepers. Choose Lifetime if the certificate never expires.',
  periodLabel: 'Programme period',
  periodHint: 'The dates this certification programme runs. Certificates can only be issued for this programme within these dates.',
  offeredFromLabel: 'Offered from',
  offeredFromHint: 'The date the certification programme starts.',
  offeredUntilLabel: 'Offered until',
  offeredUntilHint: 'Optional. The last date the programme runs. Leave blank for no end date.',
  lockedHint: 'Can’t be changed because certificates have already been issued.',
} as const

export function issuedBanner(people: number): string {
  return `This certification has been issued to ${people} ${people === 1 ? 'person' : 'people'}. Changes you make here apply only to certificates issued from now on. Existing certificates keep their dates, numbers and PDFs.`
}

// "From 1 Jan 2025" or "1 Jan 2025 – 31 Dec 2026".
export function programmePeriodLabel(t: Pick<CertificationTypeRow, 'offered_from' | 'offered_until'>): string {
  return t.offered_until ? `${formatCertDate(t.offered_from)} – ${formatCertDate(t.offered_until)}` : `From ${formatCertDate(t.offered_from)}`
}

// True once the programme's last day has passed (no new awards).
export function programmeEnded(t: Pick<CertificationTypeRow, 'offered_until'>, today: string): boolean {
  return !!t.offered_until && today > t.offered_until
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

// Validates the New / Edit certification type form.
// When editing a type that has certificates (`issued.certificates > 0`), its code and
// Offered from must stay as they are (`current`), and Offered until can't be earlier
// than the latest date achieved. Retiring is a separate action, not part of this form.
export function validateTypeForm(
  input: TypeFormInput,
  opts: { current?: Pick<CertificationTypeRow, 'code' | 'offered_from'>; issued?: IssuedFacts } = {}
): { fields: TypeFields } | { error: string } {
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
    return { error: 'Choose a certificate validity period.' }
  }

  const offered_from = clean(input.offered_from)
  if (!isRealDate(offered_from)) return { error: 'Enter the date the programme is offered from.' }

  const offered_until = clean(input.offered_until) || null
  if (offered_until) {
    if (!isRealDate(offered_until)) return { error: 'Enter a real Offered until date, or leave it blank for no end date.' }
    if (offered_until < offered_from) return { error: 'Offered until must be on or after Offered from.' }
  }

  const issued = opts.issued && opts.issued.certificates > 0 ? opts.issued : null
  if (issued && opts.current) {
    if (code !== opts.current.code) return { error: 'The code can’t be changed because certificates have already been issued. It’s part of every certificate number.' }
    if (offered_from !== opts.current.offered_from) return { error: `Offered from can’t be changed because certificates have already been issued.` }
  }
  if (issued?.latestAchievedOn && offered_until && offered_until < issued.latestAchievedOn) {
    return { error: `Offered until can’t be earlier than ${formatCertDate(issued.latestAchievedOn)}, the latest date achieved on a certificate of this type.` }
  }

  return {
    fields: {
      name,
      code,
      description: clean(input.description) || null,
      issuing_body: clean(input.issuing_body) || null,
      validity_value,
      validity_unit,
      offered_from,
      offered_until,
    },
  }
}

export function validateRetirement(retireOn: string, today: string, opts: { locked?: boolean } = {}): string | null {
  if (opts.locked) return null
  if (!isRealDate(retireOn)) return 'Enter the retirement date.'
  if (retireOn < today) return 'The retirement date must be today or later.'
  return null
}

export function validateReactivation(from: string, today: string): string | null {
  if (!isRealDate(from)) return 'Enter the date it’s offered again from.'
  if (from < today) return 'Choose today or a later date.'
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

export function typeStatusBadge(t: Pick<CertificationTypeRow, 'status' | 'retire_on' | 'returns_on'>): { label: string; tone: 'ok' | 'warn' | 'grey' } {
  if (t.status === 'retired') {
    return { label: t.returns_on ? `Retired · returns ${formatCertDate(t.returns_on)}` : 'Retired', tone: 'grey' }
  }
  if (t.status === 'retiring' && t.retire_on) return { label: `Active · retires ${formatCertDate(t.retire_on)}`, tone: 'warn' }
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
  'certification.migrated': 'Moved from earlier certification records',
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

const AUDIT_FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  code: 'Code',
  description: 'Description',
  issuing_body: 'Issuing body',
  validity: TYPE_TEXT.validityLabel,
  offered_from: 'Offered from',
  offered_until: 'Offered until',
}
function auditValue(field: string, v: unknown): string {
  if (v == null || v === '') return field === 'offered_until' ? 'no end date' : 'none'
  if (field === 'validity') return validityText(v)
  if (field === 'offered_from' || field === 'offered_until') return d(v)
  return String(v)
}

export function describeAudit(action: string, details: Record<string, unknown> | null): string {
  const x = details ?? {}
  switch (action) {
    case 'certification.migrated':
      return `${x.certificates ?? 0} certificates created from earlier certification records`
    case 'certification.type_created':
      return [`Code ${x.code}`, validityText(x.validity), x.offered_from ? `offered from ${d(x.offered_from)}` : '', x.offered_until ? `until ${d(x.offered_until)}` : ''].filter(Boolean).join(', ')
    case 'certification.type_edited': {
      // Newer entries list each changed field's before and after; older ones only the result.
      const changes = x.changes && typeof x.changes === 'object' ? Object.entries(x.changes as Record<string, { from?: unknown; to?: unknown }>) : []
      if (!changes.length) return [`Code ${x.code}`, validityText(x.validity), x.offered_from ? `offered from ${d(x.offered_from)}` : ''].filter(Boolean).join(', ')
      return changes.map(([field, c]) => `${AUDIT_FIELD_LABEL[field] ?? field}: ${auditValue(field, c?.from)} → ${auditValue(field, c?.to)}`).join('; ')
    }
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

// The latest date achieved a new award can have: today, or the programme's
// Offered until if that's earlier (used as the date picker's max).
export function lastAwardDate(t: { offered_until?: string | null } | null | undefined, today: string): string {
  return t?.offered_until && t.offered_until < today ? t.offered_until : today
}
