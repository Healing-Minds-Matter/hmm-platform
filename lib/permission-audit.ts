// Fix R: the Permissions → Audit History page shows times in Sri Lanka time
// and pages through the log 50 entries at a time, newest first. The page
// number lives in the URL (?page=2) so Back and refresh keep it.

import { formatOrgDate, formatOrgTime } from '@/lib/org-date'

export const AUDIT_PAGE_SIZE = 50
export const AUDIT_PATH = '/super-admin/permissions/audit'

// "When" column, e.g. "27 Nov 2026, 3:05 pm" — always Sri Lanka time, whatever
// time zone the server or browser runs in.
export function formatAuditWhen(iso: string): string {
  return `${formatOrgDate(iso, { dateStyle: 'medium' })}, ${formatOrgTime(iso, { timeStyle: 'short' })}`
}

// ?page= from the URL → a whole page number ≥ 1 (anything else → 1).
export function parseAuditPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !/^\d+$/.test(value)) return 1
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}

export type AuditPageWindow = {
  page: number
  totalPages: number
  from: number // first row index for .range(), 0-based
  to: number // last row index for .range(), inclusive
  showingFrom: number // 1-based, for "Showing X to Y of Z"
  showingTo: number
  hasPrevious: boolean
  hasNext: boolean
}

// Which rows to fetch for the requested page. A page past the end (e.g. an
// old link after entries were removed) shows the last page instead.
export function auditPageWindow(requestedPage: number, total: number, pageSize = AUDIT_PAGE_SIZE): AuditPageWindow {
  const safeTotal = Math.max(0, total)
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return {
    page,
    totalPages,
    from,
    to,
    showingFrom: safeTotal === 0 ? 0 : from + 1,
    showingTo: Math.min(from + pageSize, safeTotal),
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  }
}

// Link for a page; page 1 is the plain address.
export function auditPageHref(page: number): string {
  return page > 1 ? `${AUDIT_PATH}?page=${page}` : AUDIT_PATH
}
