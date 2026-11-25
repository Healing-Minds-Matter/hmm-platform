import { describe, expect, it } from 'vitest'
import { GATEKEEPER_CSV_COLUMNS, RETIRED_CERTIFICATION_DATE_MESSAGE, gatekeeperCsvHeaderError, indexClubCodes, resolveClubCell } from '@/lib/gatekeeper-csv'

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

describe('resolveClubCell', () => {
  const id1 = '3f2a1c9e-1111-4222-8333-444455556666'
  const id2 = '3f2a1c9e-1111-4222-8333-444455557777'
  const codes = indexClubCodes([
    { id: id1, club_code: 'PAN-CA' },
    { id: id2, club_code: 'DUP' },
    { id: 'x', club_code: 'dup' },
    { id: 'y', club_code: null },
  ])

  it('passes a club ID through unchanged', () => {
    expect(resolveClubCell(` ${id2} `, codes)).toEqual({ clubId: id2 })
  })

  it('turns a club code into its ID, ignoring case and spaces', () => {
    expect(resolveClubCell('PAN-CA', codes)).toEqual({ clubId: id1 })
    expect(resolveClubCell(' pan-ca ', codes)).toEqual({ clubId: id1 })
  })

  it('leaves an empty cell empty (the required-club check reports it)', () => {
    expect(resolveClubCell('', codes)).toEqual({ clubId: '' })
    expect(resolveClubCell(undefined, codes)).toEqual({ clubId: '' })
  })

  it('names an unknown code', () => {
    expect(resolveClubCell('NOPE', codes)).toEqual({ error: 'No club has the code "NOPE". Check the club code (e.g. PAN-CA) or use the club\'s ID.' })
  })

  it('refuses a code two clubs share (differing only in case)', () => {
    expect(resolveClubCell('Dup', codes)).toEqual({ error: 'More than one club has the code "Dup". Use the club\'s ID instead.' })
  })
})
