import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_PAGE_SIZE,
  auditPageHref,
  auditPageWindow,
  formatAuditWhen,
  parseAuditPage,
} from '@/lib/permission-audit'

describe('Fix R: audit times are Sri Lanka time', () => {
  it('shows a UTC moment 5½ hours later, in Sri Lanka time', () => {
    // 09:35 UTC = 3:05 pm in Sri Lanka (UTC+05:30).
    expect(formatAuditWhen('2026-11-27T09:35:00Z')).toBe('27 Nov 2026, 3:05 pm')
  })

  it('moves to the next day when Sri Lanka has passed midnight but UTC has not', () => {
    // 20:00 UTC on 26 Nov = 1:30 am on 27 Nov in Sri Lanka.
    expect(formatAuditWhen('2026-11-26T20:00:00Z')).toBe('27 Nov 2026, 1:30 am')
  })

  it('reads the stored timestamp format Supabase returns', () => {
    expect(formatAuditWhen('2026-11-27T00:00:00.123456+00:00')).toBe('27 Nov 2026, 5:30 am')
  })

  it('the page uses the shared helper, not the machine time zone', () => {
    const page = readFileSync(join(process.cwd(), 'app/(dashboard)/super-admin/permissions/audit/page.tsx'), 'utf8')
    expect(page).toContain('formatAuditWhen(e.created_at)')
    expect(page).not.toMatch(/toLocaleString\(/)
    expect(page).not.toMatch(/\.limit\(100\)/)
  })
})

describe('Fix R: page number from the URL', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['1', 1],
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['2.5', 1],
    ['abc', 1],
    ['99999999999999999999', 1],
    [['4', '7'], 4],
  ])('%j → page %i', (raw, expected) => {
    expect(parseAuditPage(raw as string | string[] | undefined)).toBe(expected)
  })
})

describe('Fix R: pages of 50, newest first', () => {
  it('uses pages of 50', () => {
    expect(AUDIT_PAGE_SIZE).toBe(50)
  })

  it('first page: rows 1–50, no Previous, Next shown', () => {
    expect(auditPageWindow(1, 120)).toEqual({
      page: 1, totalPages: 3, from: 0, to: 49,
      showingFrom: 1, showingTo: 50, hasPrevious: false, hasNext: true,
    })
  })

  it('middle page: rows 51–100, Previous and Next shown', () => {
    expect(auditPageWindow(2, 120)).toEqual({
      page: 2, totalPages: 3, from: 50, to: 99,
      showingFrom: 51, showingTo: 100, hasPrevious: true, hasNext: true,
    })
  })

  it('last page: the remaining rows, Previous shown, no Next', () => {
    expect(auditPageWindow(3, 120)).toEqual({
      page: 3, totalPages: 3, from: 100, to: 149,
      showingFrom: 101, showingTo: 120, hasPrevious: true, hasNext: false,
    })
  })

  it('exactly 50 entries: one page, no Next', () => {
    expect(auditPageWindow(1, 50)).toMatchObject({ totalPages: 1, showingTo: 50, hasNext: false })
  })

  it('51 entries: Next leads to a second page holding the oldest one', () => {
    expect(auditPageWindow(1, 51).hasNext).toBe(true)
    expect(auditPageWindow(2, 51)).toMatchObject({ showingFrom: 51, showingTo: 51, hasNext: false })
  })

  it('empty log: one page, nothing to show, no buttons active', () => {
    expect(auditPageWindow(1, 0)).toEqual({
      page: 1, totalPages: 1, from: 0, to: 49,
      showingFrom: 0, showingTo: 0, hasPrevious: false, hasNext: false,
    })
  })

  it('a page past the end shows the last page', () => {
    expect(auditPageWindow(9, 120)).toMatchObject({ page: 3, from: 100 })
    expect(auditPageWindow(5, 0)).toMatchObject({ page: 1, from: 0 })
  })
})

describe('Fix R: page links keep the page in the URL', () => {
  it('page 1 is the plain address; later pages add ?page=', () => {
    expect(auditPageHref(1)).toBe('/super-admin/permissions/audit')
    expect(auditPageHref(2)).toBe('/super-admin/permissions/audit?page=2')
  })
})
