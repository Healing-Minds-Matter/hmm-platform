import { describe, expect, it, vi } from 'vitest'
import { parseCsv } from '@/lib/csv'
import {
  CLUB_CSV_COLUMNS,
  clubCsvHeaderError,
  createClubsFromCsv,
  describeClubInsertError,
  findClubConflict,
  validateClubFields,
  type BulkClubDeps,
  type ExistingClub,
} from '@/lib/club-rules'

const HEADER = CLUB_CSV_COLUMNS.join(',')
const HEADER_ERROR = `The first row of the file must be exactly: ${HEADER}`

function upload(text: string) {
  const [head, ...rows] = parseCsv(text)
  return { header: head.cells.map(h => h.toLowerCase()), rows }
}

function fakeDeps(existingClubs: ExistingClub[] = []) {
  let next = 1
  const deps: BulkClubDeps = {
    existingClubs,
    insertClub: vi.fn(async () => ({ id: `club-${next++}` })),
    onCreated: vi.fn(async () => {}),
  }
  return deps
}

describe('validateClubFields', () => {
  const base = { name: 'Rotaract Club of Colombo', code: 'RAC-001', address: 'Colombo 03' }

  it('accepts a valid club and trims values', () => {
    expect(validateClubFields({ ...base, name: '  Rotaract Club of Colombo ', description: '' })).toEqual({
      club: {
        name: 'Rotaract Club of Colombo', club_code: 'RAC-001', location: 'Colombo 03',
        description: null, contact_email: null, contact_phone: null,
      },
    })
  })

  it('requires code, name and address', () => {
    expect(validateClubFields({ ...base, code: ' ' })).toEqual({ error: 'Club code is required.' })
    expect(validateClubFields({ ...base, name: '' })).toEqual({ error: 'Club name is required.' })
    expect(validateClubFields({ ...base, address: undefined })).toEqual({ error: 'Address is required.' })
  })

  it('rejects a badly formed contact email', () => {
    expect(validateClubFields({ ...base, contactEmail: 'not-an-email' })).toEqual({
      error: 'Enter a valid contact email, e.g. club@example.com.',
    })
  })

  it('normalises phone numbers, treating local numbers as Sri Lankan', () => {
    const phoneOf = (contactPhone: string) => {
      const r = validateClubFields({ ...base, contactPhone })
      return 'club' in r ? r.club.contact_phone : r.error
    }
    expect(phoneOf('077 123 4567')).toBe('+94771234567')
    expect(phoneOf('011 234 5678')).toBe('+94112345678')
    expect(phoneOf('+44 20 7946 0958')).toBe('+442079460958')
    expect(phoneOf('12345')).toMatch(/^Enter a valid phone number/)
  })
})

describe('findClubConflict', () => {
  const existing = [{ name: 'Rotaract Club of Kandy', club_code: 'RAC-002' }]

  it('matches codes and names regardless of capitals or spaces', () => {
    expect(findClubConflict({ name: 'New', club_code: ' rac-002' }, existing)).toBe(
      'Club code " rac-002" is already taken. Please choose a unique code.'
    )
    expect(findClubConflict({ name: 'ROTARACT CLUB OF KANDY', club_code: 'X' }, existing)).toBe(
      'A club with that name already exists.'
    )
  })

  it('returns null when both are new', () => {
    expect(findClubConflict({ name: 'Rotaract Club of Galle', club_code: 'RAC-003' }, existing)).toBeNull()
  })
})

describe('describeClubInsertError', () => {
  it('turns unique-index errors into plain messages', () => {
    const club = { club_code: 'RAC-1' }
    expect(describeClubInsertError({ code: '23505', message: 'duplicate key value violates unique constraint "clubs_club_code_unique"' }, club))
      .toBe('Club code "RAC-1" is already taken. Please choose a unique code.')
    expect(describeClubInsertError({ code: '23505', message: 'duplicate key value violates unique constraint "clubs_name_key"' }, club))
      .toBe('A club with that name already exists.')
    expect(describeClubInsertError({ code: '42501', message: 'raw postgres text' }, club))
      .toBe('The club could not be saved. Please try again.')
  })
})

describe('clubCsvHeaderError', () => {
  it('accepts the exact header, optionally followed by a problem column', () => {
    expect(clubCsvHeaderError([...CLUB_CSV_COLUMNS])).toBeNull()
    expect(clubCsvHeaderError([...CLUB_CSV_COLUMNS, 'problem'])).toBeNull()
  })

  it.each([
    ['a missing column', ['name', 'code', 'address', 'contact_email', 'contact_phone']],
    ['columns in a different order', ['code', 'name', 'address', 'contact_email', 'contact_phone', 'description']],
    ['a misspelt column', ['name', 'code', 'adress', 'contact_email', 'contact_phone', 'description']],
    ['an extra column', [...CLUB_CSV_COLUMNS, 'notes']],
  ])('rejects a header with %s', (_label, header) => {
    expect(clubCsvHeaderError(header)).toBe(HEADER_ERROR)
  })
})

describe('createClubsFromCsv', () => {
  it('check: marks valid rows ready and saves nothing', async () => {
    const deps = fakeDeps()
    const result = await createClubsFromCsv(upload(`${HEADER}
Rotaract Club of Colombo,RAC-001,Colombo,,,
Rotaract Club of Kandy,RAC-002,,,,`), deps, 'check')
    expect(result).toEqual({
      results: [
        { row: 2, label: 'Rotaract Club of Colombo', status: 'ready' },
        { row: 3, label: 'Rotaract Club of Kandy', status: 'failed', error: 'Address is required.' },
      ],
    })
    expect(deps.insertClub).not.toHaveBeenCalled()
    expect(deps.onCreated).not.toHaveBeenCalled()
  })

  it('save: creates every row of a valid file', async () => {
    const deps = fakeDeps()
    const result = await createClubsFromCsv(upload(`${HEADER}
Rotaract Club of Colombo,RAC-001,"12 Galle Rd, Colombo 03",colombo@example.com,077 123 4567,City club
Rotaract Club of Kandy,RAC-002,Kandy,,,`), deps, 'save')

    expect(result).toEqual({
      results: [
        { row: 2, label: 'Rotaract Club of Colombo', status: 'created' },
        { row: 3, label: 'Rotaract Club of Kandy', status: 'created' },
      ],
    })
    expect(deps.insertClub).toHaveBeenCalledWith({
      name: 'Rotaract Club of Colombo', club_code: 'RAC-001', location: '12 Galle Rd, Colombo 03',
      contact_email: 'colombo@example.com', contact_phone: '+94771234567', description: 'City club',
    })
    expect(deps.onCreated).toHaveBeenCalledTimes(2)
  })

  it('rejects the whole file for a wrong header', async () => {
    const deps = fakeDeps()
    expect(await createClubsFromCsv(upload('name,code,location\nA,B,C'), deps, 'save')).toEqual({ error: HEADER_ERROR })
    expect(deps.insertClub).not.toHaveBeenCalled()
  })

  it('accepts a re-uploaded "failed rows" file and ignores its problem column', async () => {
    const result = await createClubsFromCsv(upload(`${HEADER},problem
Club A,RAC-1,Colombo,,,Address is required.`), fakeDeps(), 'save')
    expect(result).toEqual({ results: [{ row: 2, label: 'Club A', status: 'created' }] })
  })

  it('reports each missing required field on its own row', async () => {
    const result = await createClubsFromCsv(upload(`${HEADER}
,RAC-1,Colombo,,,
Club A,,Colombo,,,
Club B,RAC-3,,,,`), fakeDeps(), 'check')
    expect('results' in result && result.results).toEqual([
      { row: 2, label: '(no name)', status: 'failed', error: 'Club name is required.' },
      { row: 3, label: 'Club A', status: 'failed', error: 'Club code is required.' },
      { row: 4, label: 'Club B', status: 'failed', error: 'Address is required.' },
    ])
  })

  const DUPLICATES = `${HEADER}
Club A,RAC-1,Colombo,,,
Club B,rac-1,Colombo,,,
club a,RAC-3,Colombo,,,`

  it('check: points duplicates within the file at the earlier row', async () => {
    const result = await createClubsFromCsv(upload(DUPLICATES), fakeDeps(), 'check')
    expect('results' in result && result.results.slice(1)).toEqual([
      { row: 3, label: 'Club B', status: 'failed', error: 'Same club code as row 2 in this file.' },
      { row: 4, label: 'club a', status: 'failed', error: 'Same club name as row 2 in this file.' },
    ])
  })

  it('save: reports duplicates of a just-created row as already taken', async () => {
    // The earlier row is registered, so it won't be in the "failed rows"
    // file; "row 2" would point at nothing there.
    const deps = fakeDeps()
    const result = await createClubsFromCsv(upload(DUPLICATES), deps, 'save')
    expect('results' in result && result.results).toEqual([
      { row: 2, label: 'Club A', status: 'created' },
      { row: 3, label: 'Club B', status: 'failed', error: 'Club code "rac-1" is already taken. Please choose a unique code.' },
      { row: 4, label: 'club a', status: 'failed', error: 'A club with that name already exists.' },
    ])
    expect(deps.insertClub).toHaveBeenCalledTimes(1)
  })

  it('rejects rows that clash with clubs already in the system', async () => {
    const deps = fakeDeps([{ name: 'Rotaract Club of Galle', club_code: 'RAC-009' }])
    const result = await createClubsFromCsv(upload(`${HEADER}
New Club,rac-009,Galle,,,
rotaract club of galle,RAC-010,Galle,,,`), deps, 'save')
    expect('results' in result && result.results).toEqual([
      { row: 2, label: 'New Club', status: 'failed', error: 'Club code "rac-009" is already taken. Please choose a unique code.' },
      { row: 3, label: 'rotaract club of galle', status: 'failed', error: 'A club with that name already exists.' },
    ])
    expect(deps.insertClub).not.toHaveBeenCalled()
  })

  it('rejects a bad email and a bad phone number', async () => {
    const result = await createClubsFromCsv(upload(`${HEADER}
Club A,RAC-1,Colombo,club@,,
Club B,RAC-2,Colombo,,123,`), fakeDeps(), 'check')
    expect('results' in result && result.results.map(r => r.error)).toEqual([
      'Enter a valid contact email, e.g. club@example.com.',
      expect.stringMatching(/^Enter a valid phone number/),
    ])
  })

  it('ignores blank lines and reports real file line numbers', async () => {
    const result = await createClubsFromCsv(upload(`${HEADER}

Club A,RAC-1,Colombo,,,

Club B,,Colombo,,,
`), fakeDeps(), 'check')
    expect('results' in result && result.results.map(r => [r.row, r.status])).toEqual([[3, 'ready'], [5, 'failed']])
  })

  it('flags a row with an unquoted comma instead of shifting its columns', async () => {
    const result = await createClubsFromCsv(upload(`${HEADER}
Club A,RAC-1,12 Galle Rd, Colombo 03,,,`), fakeDeps(), 'check')
    expect('results' in result && result.results[0].error).toBe(
      'This row has more columns than the header. Put quotes around any value that contains a comma.'
    )
  })

  it('save: carries on after a failed insert and reports its reason', async () => {
    const deps = fakeDeps()
    vi.mocked(deps.insertClub).mockResolvedValueOnce({ error: 'A club with that name already exists.' })
    const result = await createClubsFromCsv(upload(`${HEADER}
Club A,RAC-1,Colombo,,,
Club B,RAC-2,Colombo,,,`), deps, 'save')
    expect(result).toEqual({
      results: [
        { row: 2, label: 'Club A', status: 'failed', error: 'A club with that name already exists.' },
        { row: 3, label: 'Club B', status: 'created' },
      ],
    })
    expect(deps.onCreated).toHaveBeenCalledTimes(1)
  })
})
