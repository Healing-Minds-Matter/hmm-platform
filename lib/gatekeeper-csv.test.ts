import { describe, expect, it } from 'vitest'
import { GATEKEEPER_CSV_COLUMNS, RETIRED_CERTIFICATION_DATE_MESSAGE, gatekeeperCsvHeaderError } from '@/lib/gatekeeper-csv'

describe('gatekeeperCsvHeaderError', () => {
  it('needs no certification column: certificates are added after registration', () => {
    expect(GATEKEEPER_CSV_COLUMNS.super_admin).toEqual(['full_name', 'email', 'phone', 'club_id'])
    expect(GATEKEEPER_CSV_COLUMNS.champion).toEqual(['full_name', 'email', 'phone'])
    expect(gatekeeperCsvHeaderError(['full_name', 'email', 'phone', 'club_id'], 'super_admin')).toBeNull()
    expect(gatekeeperCsvHeaderError(['phone', 'full_name', 'email'], 'champion')).toBeNull()
  })

  it('refuses the old certification_date column instead of dropping its dates', () => {
    expect(gatekeeperCsvHeaderError(['full_name', 'email', 'phone', 'club_id', 'certification_date'], 'super_admin'))
      .toBe(RETIRED_CERTIFICATION_DATE_MESSAGE)
    expect(gatekeeperCsvHeaderError(['full_name', 'email', 'phone', 'certification_date'], 'champion'))
      .toBe(RETIRED_CERTIFICATION_DATE_MESSAGE)
  })

  it('still names missing required columns', () => {
    expect(gatekeeperCsvHeaderError(['full_name', 'email'], 'super_admin')).toBe('CSV header must include: full_name, email, phone, club_id.')
  })
})
