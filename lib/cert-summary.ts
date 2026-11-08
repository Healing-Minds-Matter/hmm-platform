// Certifications in lists and dashboards (Epic 10, Story 10.12). Pure functions
// over current certificates (rows of certificate_statuses with is_current and
// not removed), so every screen uses the status rules of Story 10.0.

import { formatCertDate } from '@/lib/certification-types'
import type { CertificateStatus } from '@/lib/certificates'
import type { PersonCertStatus } from '@/app/(dashboard)/super-admin/gatekeepers/gatekeeper-status'

export type CurrentCert = { id: string; holder_id: string; type_id: string; status: CertificateStatus; achieved_on: string; expires_on: string | null }
export const CURRENT_CERT_COLUMNS = 'id, holder_id, type_id, status, achieved_on, expires_on'

export function byHolder(rows: CurrentCert[]): Map<string, CurrentCert[]> {
  const m = new Map<string, CurrentCert[]>()
  for (const r of rows) {
    const list = m.get(r.holder_id)
    if (list) list.push(r)
    else m.set(r.holder_id, [r])
  }
  return m
}

// One status per person across all their current certificates, whatever the type:
// Certified if any certificate is valid; otherwise Expiring soon if any is expiring
// soon; otherwise Expired (expired, or stopped by a retirement); No certifications
// if they hold none. An inactive person shows as Inactive.
export function personCertStatus(isActive: boolean, certs: CurrentCert[] | undefined): PersonCertStatus {
  if (!isActive) return 'inactive'
  if (!certs?.length) return 'none'
  if (certs.some(c => c.status === 'valid')) return 'certified'
  if (certs.some(c => c.status === 'expiring_soon')) return 'expiring_soon'
  return 'expired'
}

// The three statuses lists can be filtered by (Story 10.12 Sc01).
export type ListStatus = 'valid' | 'expiring_soon' | 'expired'
export const LIST_STATUSES: { id: ListStatus; label: string }[] = [
  { id: 'valid', label: 'Valid' }, { id: 'expiring_soon', label: 'Expiring soon' }, { id: 'expired', label: 'Expired' },
]
export function listStatusOf(s: CertificateStatus): ListStatus {
  return s === 'valid' ? 'valid' : s === 'expiring_soon' ? 'expiring_soon' : 'expired'
}

// Filters: a certification type (or 'none' for people with no certifications), and a status.
// With a type, the status applies to that type's certificate; without one, to any certificate.
export function matchesCertFilter(certs: CurrentCert[], typeFilter: string | undefined, statusFilter: string | undefined): boolean {
  if (typeFilter === 'none') return certs.length === 0
  const pool = typeFilter ? certs.filter(c => c.type_id === typeFilter) : certs
  if (typeFilter && pool.length === 0) return false
  if (!statusFilter) return true
  return pool.some(c => listStatusOf(c.status) === statusFilter)
}

export function certChipText(c: Pick<CurrentCert, 'status' | 'expires_on'>, today?: string): string {
  if (c.status === 'stopped') return 'Stopped'
  if (!c.expires_on) return 'Lifetime'
  if (c.status === 'expired') return `Expired ${formatCertDate(c.expires_on)}`
  return `${today && c.expires_on === today ? 'Expires today' : `Until ${formatCertDate(c.expires_on)}`}`
}

export const CHIP_TONE: Record<ListStatus, string> = {
  valid: 'bg-[#E6FFE7] text-[#0D8275]',
  expiring_soon: 'bg-[#D97706]/10 text-[#B45309]',
  expired: 'bg-[#FEF2F2] text-[#DC2626]',
}

// ── Dashboard figures (Story 10.12 Sc03) ─────────────────────────────────────
export type TypeFigures = { typeId: string; valid: number; expiringSoon: number; expired: number; holders: number }

// One row per type that has holders, plus how many of `people` have no certifications.
export function certificationFigures(rows: CurrentCert[], people: string[]): { perType: TypeFigures[]; withoutCertifications: number } {
  const inScope = new Set(people)
  const perType = new Map<string, TypeFigures>()
  const holding = new Set<string>()
  for (const r of rows) {
    if (!inScope.has(r.holder_id)) continue
    holding.add(r.holder_id)
    const f = perType.get(r.type_id) ?? { typeId: r.type_id, valid: 0, expiringSoon: 0, expired: 0, holders: 0 }
    f.holders++
    const s = listStatusOf(r.status)
    if (s === 'valid') f.valid++
    else if (s === 'expiring_soon') f.expiringSoon++
    else f.expired++
    perType.set(r.type_id, f)
  }
  return {
    perType: [...perType.values()].sort((a, b) => b.holders - a.holders),
    withoutCertifications: people.filter(p => !holding.has(p)).length,
  }
}

// Club/Champion certification-rate numbers, of `people`, across all types:
// certified = holds at least one certificate that is valid or expiring soon;
// expiringSoon = certified, but every such certificate is expiring soon.
export function certifiedFigures(byHolderMap: Map<string, CurrentCert[]>, people: string[]): { certified: number; expiringSoon: number; total: number } {
  let certified = 0
  let expiringSoon = 0
  for (const p of people) {
    const s = personCertStatus(true, byHolderMap.get(p))
    if (s === 'certified' || s === 'expiring_soon') certified++
    if (s === 'expiring_soon') expiringSoon++
  }
  return { certified, expiringSoon, total: people.length }
}

// "People with a current certification" (sheet rows 59, 78): of the certified
// people (see certifiedFigures), those who became certified this month — none of
// their current valid/expiring certificates was achieved before `monthStart`
// (YYYY-MM-DD, Sri Lanka). Matches club_certified_people() used by the mobile app.
export function certifiedThisMonth(byHolderMap: Map<string, CurrentCert[]>, people: string[], monthStart: string): number {
  let n = 0
  for (const p of people) {
    const current = (byHolderMap.get(p) ?? []).filter(c => c.status === 'valid' || c.status === 'expiring_soon')
    if (current.length && current.every(c => c.achieved_on >= monthStart)) n++
  }
  return n
}
