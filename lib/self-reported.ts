// Self-reported certifications (Epic 10, Stories 10.9 and 10.10): form rules,
// review reasons and labels. Pure functions, shared by the pages and the server
// actions. The database (migration 20261103000000: self_reported_before) enforces
// the same rules; these give a clear message first.

import { formatCertDate, isRealDate } from '@/lib/certification-types'

export type SelfReportedState = 'unverified' | 'verified' | 'removed' | 'withdrawn'

export type SelfReportedRow = {
  id: string
  holder_id: string
  name: string
  organisation: string
  achieved_on: string
  expires_on: string | null
  attachment_path: string | null
  state: SelfReportedState
  reviewed_by: string | null
  reviewed_at: string | null
  removed_reason_category: string | null
  removed_reason: string | null
  withdrawn_at: string | null
  created_at: string
}

export const SELF_REPORTED_COLUMNS =
  'id, holder_id, name, organisation, achieved_on, expires_on, attachment_path, state, reviewed_by, reviewed_at, removed_reason_category, removed_reason, withdrawn_at, created_at'

export const SELF_STATE_BADGE: Record<SelfReportedState, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'grey' }> = {
  unverified: { label: 'Self-reported – not verified', tone: 'warn' },
  verified: { label: 'Self-reported – verified', tone: 'ok' },
  removed: { label: 'Removed by reviewer', tone: 'grey' },
  withdrawn: { label: 'Withdrawn by holder', tone: 'grey' },
}

// Must match the check constraint on self_reported_certificates.removed_reason_category.
export const SELF_REMOVE_REASONS = [
  'Attachment doesn’t show a completed certificate',
  'Details don’t match the attachment',
  'Not a recognised certification',
  'Already recorded as an official certification',
  'Other',
] as const

export type SelfReportedInput = { name: string; organisation: string; achievedOn: string; noExpiry: boolean; expiresOn: string }

export function validateSelfReported(input: SelfReportedInput, today: string):
  { fields: { name: string; organisation: string; achieved_on: string; expires_on: string | null } } | { error: string } {
  const name = input.name.trim()
  const organisation = input.organisation.trim()
  if (!name) return { error: 'Enter the certification name.' }
  if (name.length > 160) return { error: 'The certification name can be at most 160 characters.' }
  if (!organisation) return { error: 'Enter the issuing organisation.' }
  if (organisation.length > 160) return { error: 'The organisation can be at most 160 characters.' }
  if (!isRealDate(input.achievedOn)) return { error: 'Enter the date achieved.' }
  if (input.achievedOn > today) return { error: 'The date achieved can’t be in the future.' }
  let expires_on: string | null = null
  if (!input.noExpiry) {
    if (!isRealDate(input.expiresOn)) return { error: 'Enter the expiry date, or choose No expiry.' }
    if (input.expiresOn < input.achievedOn) return { error: 'The expiry date can’t be before the date achieved.' }
    expires_on = input.expiresOn
  }
  return { fields: { name, organisation, achieved_on: input.achievedOn, expires_on } }
}

export function validateSelfRemoval(category: string, reason: string): string | null {
  if (!(SELF_REMOVE_REASONS as readonly string[]).includes(category)) return 'Choose a reason.'
  if (reason.trim().length < 10) return 'Explain the reason in a sentence (at least 10 characters). The person will see it.'
  return null
}

// "Valid until 3 Mar 2027", "Expired 1 Jan 2026" or "No expiry".
export function selfExpiryLabel(expiresOn: string | null, today: string): string {
  if (!expiresOn) return 'No expiry'
  return expiresOn < today ? `Expired ${formatCertDate(expiresOn)}` : `Valid until ${formatCertDate(expiresOn)}`
}

export type ReviewFilter = 'waiting' | 'verified' | 'removed' | 'all'
export const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'waiting', label: 'Waiting for review' },
  { key: 'verified', label: 'Verified' },
  { key: 'removed', label: 'Removed' },
  { key: 'all', label: 'Everything' },
]
export function reviewFilterFrom(value: string | undefined): ReviewFilter {
  return REVIEW_FILTERS.some(f => f.key === value) ? (value as ReviewFilter) : 'waiting'
}
export const FILTER_STATE: Record<ReviewFilter, SelfReportedState[]> = {
  waiting: ['unverified'],
  verified: ['verified'],
  removed: ['removed'],
  all: ['unverified', 'verified', 'removed'],
}
