// Official certificates (Epic 10, Stories 10.0, 10.5–10.8, 10.11): statuses,
// form rules, removal reasons and the certification journey. Pure functions,
// shared by the pages and the server actions. The database enforces the same
// rules (migration 20261103000000); these give clear messages first.

import { formatCertDate, isRealDate, type CertificationTypeRow, type RetirementOption } from '@/lib/certification-types'
import type { SelfReportedRow } from '@/lib/self-reported'

export type CertificateStatus = 'valid' | 'expiring_soon' | 'expired' | 'stopped' | 'renewed' | 'removed'
export type CertificateFormat = 'physical' | 'digital' | 'both'

// A row of the certificate_statuses view.
export type CertificateRow = {
  id: string
  holder_id: string
  type_id: string
  achieved_on: string
  expires_on: string | null
  validity_value: number | null
  validity_unit: 'months' | 'years' | null
  format: CertificateFormat
  attachment_path: string | null
  pdf_path: string | null
  certificate_number: string | null
  design_version: number | null
  migrated: boolean
  added_by: string | null
  created_at: string
  removed_at: string | null
  removed_by: string | null
  removed_reason_category: string | null
  removed_reason: string | null
  is_current: boolean
  stopped_on: string | null
  status: CertificateStatus
}

export const CERTIFICATE_COLUMNS =
  'id, holder_id, type_id, achieved_on, expires_on, validity_value, validity_unit, format, attachment_path, pdf_path, certificate_number, design_version, migrated, added_by, created_at, removed_at, removed_by, removed_reason_category, removed_reason, is_current, stopped_on, status'

export type CertificateEvent = {
  id: string
  certificate_id: string
  kind: 'edited' | 'removed' | 'restored'
  actor_label: string
  reason: string | null
  changes: Record<string, unknown> | null
  created_at: string
}

export const STATUS_BADGE: Record<CertificateStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'grey' }> = {
  valid: { label: 'Valid', tone: 'ok' },
  expiring_soon: { label: 'Expiring soon', tone: 'warn' },
  expired: { label: 'Expired', tone: 'bad' },
  stopped: { label: 'Stopped (programme retired)', tone: 'bad' },
  renewed: { label: 'Renewed', tone: 'info' },
  removed: { label: 'Removed', tone: 'grey' },
}

export const FORMAT_LABEL: Record<CertificateFormat, string> = { physical: 'Physical', digital: 'Digital', both: 'Both' }

// Must match the check constraint on certificates.removed_reason_category.
export const REMOVE_REASONS = [
  'Added by mistake',
  'Added to the wrong person',
  'Training was not completed',
  'Certificate could not be verified',
  'Duplicate record',
  'Other',
] as const

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const ATTACHMENT_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export const ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png'

// The file's extension for storage, or an error. A file with no size counts as "no file".
export function checkAttachment(file: { name: string; size: number; type: string } | null): { ext: string } | { error: string } | null {
  if (!file || file.size === 0) return null
  const ext = ATTACHMENT_TYPES[file.type] ?? ({ pdf: 'pdf', jpg: 'jpg', jpeg: 'jpg', png: 'png' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() ?? '']
  if (!ext || (file.type && !ATTACHMENT_TYPES[file.type])) return { error: 'The attachment must be a PDF, JPG or PNG.' }
  if (file.size > ATTACHMENT_MAX_BYTES) return { error: 'The attachment must be 10 MB or less.' }
  return { ext }
}

// The file's first bytes, so a file only renamed to .pdf/.jpg/.png is refused.
const ATTACHMENT_SIGNATURES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
}
export const ATTACHMENT_CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }

export function attachmentContentError(bytes: Uint8Array, ext: string): string | null {
  const sig = ATTACHMENT_SIGNATURES[ext]
  if (!sig || bytes.length < sig.length || sig.some((b, i) => bytes[i] !== b)) {
    return 'The attachment isn’t a real PDF, JPG or PNG file. Please choose the original file.'
  }
  return null
}

export function expiryFor(achievedOn: string, value: number | null, unit: 'months' | 'years' | null): string | null {
  if (value == null || !unit || !isRealDate(achievedOn)) return null
  const [y, m, d] = achievedOn.split('-').map(Number)
  const months = unit === 'years' ? value * 12 : value
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))   // same rule as Postgres: 31 Jan + 1 month = 28/29 Feb
  return target.toISOString().slice(0, 10)
}

// Checks a new award, or (with `edit`) a correction to an existing certificate.
// The programme's Offered until only limits new awards: edits aren't re-checked against it.
export function validateAward(
  input: { achievedOn: string; format: string },
  type: Pick<CertificationTypeRow, 'name' | 'status' | 'offered_from'> & { offered_until?: string | null } | null,
  today: string,
  previousAchievedOn?: string | null,
  opts: { edit?: boolean } = {}
): string | null {
  if (!type) return 'Choose a certification type.'
  if (type.status === 'retired') return `${type.name} is retired and can’t be awarded.`
  if (!isRealDate(input.achievedOn)) return 'Enter the date achieved.'
  if (input.achievedOn > today) return 'The date achieved can’t be in the future.'
  if (input.achievedOn < type.offered_from) return `${type.name} was only offered from ${formatCertDate(type.offered_from)}.`
  if (!opts.edit && type.offered_until) {
    if (input.achievedOn > type.offered_until) return `${type.name} was only offered until ${formatCertDate(type.offered_until)}, so the date achieved can’t be after that.`
    if (today > type.offered_until) return `${type.name} stopped being offered on ${formatCertDate(type.offered_until)}, so no new certificates of it can be added.`
  }
  if (!(input.format in FORMAT_LABEL)) return 'Choose a certificate format.'
  if (previousAchievedOn && input.achievedOn <= previousAchievedOn) return `The renewal must be after the previous certificate (${formatCertDate(previousAchievedOn)}).`
  return null
}

export function validateRemoval(category: string, reason: string): string | null {
  if (!(REMOVE_REASONS as readonly string[]).includes(category)) return 'Choose a reason.'
  if (reason.trim().length < 10) return 'Explain the reason in a sentence (at least 10 characters). The person will see it.'
  return null
}

// Renew appears on a current certificate that is expired (or stopped by a past retirement) when its type is active
// and its programme is still running (a renewal is a new award, so Offered until applies).
export function canRenew(cert: Pick<CertificateRow, 'status' | 'removed_at' | 'is_current'>, typeStatus: string | undefined, opts: { programmeEnded?: boolean } = {}): boolean {
  return !cert.removed_at && cert.is_current && (cert.status === 'expired' || cert.status === 'stopped') && typeStatus !== 'retired' && !opts.programmeEnded
}

export function describeCertError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code === '23514' || error.code === '42501' || error.code === 'P0001') return error.message ?? 'That change isn’t allowed.'
  if ((error.message ?? '').includes('row-level security')) return 'You don’t have permission to do that.'
  if (error.code === '23505') return 'That certificate already exists.'
  return 'Something went wrong. Please try again.'
}

// ── Journey (Story 10.11) ────────────────────────────────────────────────────
export type JourneyEntry =
  | { key: string; date: string; kind: 'certificate'; cert: CertificateRow }
  | { key: string; date: string; kind: 'expired'; cert: CertificateRow }
  | { key: string; date: string; kind: 'event'; cert: CertificateRow; event: CertificateEvent }
  | { key: string; date: string; kind: 'retired'; typeId: string; option: RetirementOption }
  | { key: string; date: string; kind: 'reactivated'; typeId: string; stoppedCerts: number }
  | { key: string; date: string; kind: 'self'; self: SelfReportedRow }
  | { key: string; date: string; kind: 'self_outcome'; self: SelfReportedRow; at: string }

export type RetirementForJourney = { id: string; type_id: string; retire_on: string; option: RetirementOption; reactivated_on: string | null }

const dayOf = (iso: string) => iso.slice(0, 10)

// Newest first. Events are dated by when they happened; retirements only appear for
// types the person held a certificate of before the retirement took effect.
export function buildJourney(certs: CertificateRow[], events: CertificateEvent[], retirements: RetirementForJourney[], today: string, toOrgDate: (iso: string) => string = dayOf, selfReported: SelfReportedRow[] = []): JourneyEntry[] {
  const entries: JourneyEntry[] = []
  // Self-reported: when achieved, and its review outcome or withdrawal.
  for (const sr of selfReported) {
    entries.push({ key: `s-${sr.id}`, date: sr.achieved_on, kind: 'self', self: sr })
    const at = sr.state === 'withdrawn' ? sr.withdrawn_at : sr.state === 'unverified' ? null : sr.reviewed_at
    if (at) entries.push({ key: `so-${sr.id}`, date: toOrgDate(at), kind: 'self_outcome', self: sr, at })
  }
  const certById = new Map(certs.map(c => [c.id, c]))
  for (const c of certs) {
    entries.push({ key: `c-${c.id}`, date: c.achieved_on, kind: 'certificate', cert: c })
    if (c.expires_on && c.expires_on < today && !c.removed_at && (c.status === 'expired' || c.status === 'renewed')) {
      // An expiry is only news if it happened before the person renewed.
      const renewedBefore = certs.some(o => o.type_id === c.type_id && o.id !== c.id && !o.removed_at && o.achieved_on > c.achieved_on && o.achieved_on <= c.expires_on!)
      if (!renewedBefore) entries.push({ key: `x-${c.id}`, date: c.expires_on, kind: 'expired', cert: c })
    }
  }
  for (const e of events) {
    const cert = certById.get(e.certificate_id)
    if (cert) entries.push({ key: `e-${e.id}`, date: toOrgDate(e.created_at), kind: 'event', cert, event: e })
  }
  for (const r of retirements) {
    const held = certs.filter(c => c.type_id === r.type_id && !c.removed_at && c.achieved_on < r.retire_on)
    if (!held.length) continue
    const tookEffect = r.retire_on <= today && (r.reactivated_on == null || r.reactivated_on > r.retire_on)
    if (tookEffect) entries.push({ key: `r-${r.id}`, date: r.retire_on, kind: 'retired', typeId: r.type_id, option: r.option })
    if (tookEffect && r.reactivated_on && r.reactivated_on <= today) {
      entries.push({ key: `ra-${r.id}`, date: r.reactivated_on, kind: 'reactivated', typeId: r.type_id, stoppedCerts: r.option === 'stop' ? held.length : 0 })
    }
  }
  const rank = { reactivated: 0, retired: 1, event: 2, self_outcome: 2, expired: 3, certificate: 4, self: 4 } as const
  // Same day: events first, newest of them first.
  const at = (e: JourneyEntry) => (e.kind === 'event' ? e.event.created_at : e.kind === 'self_outcome' ? e.at : '')
  return entries.sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind] || at(b).localeCompare(at(a)))
}

// "date achieved 12 Mar 2026 → 10 Mar 2026; format Physical → Both" from an edit's recorded changes.
export function describeChanges(changes: Record<string, unknown> | null): string {
  if (!changes) return ''
  const parts: string[] = []
  const pair = (v: unknown) => (Array.isArray(v) && v.length === 2 ? v as [string, string] : null)
  const a = pair(changes.achieved_on)
  if (a) parts.push(`date achieved ${formatCertDate(a[0])} → ${formatCertDate(a[1])}`)
  const f = pair(changes.format)
  if (f) parts.push(`format ${FORMAT_LABEL[f[0] as CertificateFormat] ?? f[0]} → ${FORMAT_LABEL[f[1] as CertificateFormat] ?? f[1]}`)
  if (changes.attachment) parts.push('attachment replaced')
  if (typeof changes.certificate_generated === 'string') parts.push(`digital certificate ${changes.certificate_generated} generated`)
  else if (changes.reissued_with_design != null) parts.push(`PDF re-issued with design v${changes.reissued_with_design}`)
  return parts.join('; ')
}
