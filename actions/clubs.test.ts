import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUB_CSV_COLUMNS } from '@/lib/club-rules'

// A stand-in for the Supabase client with just what the club actions use:
// the signed-in user, their profile role, the clubs list and club inserts.
const db = vi.hoisted(() => ({
  role: 'super_admin' as string,
  // savedMeanwhile: created by someone else after the list was read, so only
  // the database's unique index sees it.
  clubs: [] as { id: string; name: string; club_code: string | null; savedMeanwhile?: boolean }[],
  inserts: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: db.role } }) }) }) }
      }
      if (table === 'clubs') {
        return {
          select: async () => ({
            data: db.clubs.filter(c => !c.savedMeanwhile).map(({ name, club_code }) => ({ name, club_code })),
            error: null,
          }),
          insert: (row: { name: string; club_code: string }) => ({
            select: () => ({
              single: async () => {
                // Mirrors the real unique indexes (case-sensitive in the database).
                if (db.clubs.some(c => c.name === row.name)) {
                  return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "clubs_name_key"' } }
                }
                const id = `club-${db.clubs.length + 1}`
                db.inserts.push(row)
                db.clubs.push({ id, name: row.name, club_code: row.club_code })
                return { data: { id }, error: null }
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async (entry: Record<string, unknown>) => { db.audit.push(entry) }) }))
vi.mock('@/actions/permissions', () => ({ endDelegationsForDeactivatedUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { revalidatePath } from 'next/cache'
import { createClubAction, createClubsBulkAction } from '@/actions/clubs'

const HEADER = CLUB_CSV_COLUMNS.join(',')

function csvForm(text: string) {
  const form = new FormData()
  form.set('csv_file', new File([text], 'clubs.csv', { type: 'text/csv' }))
  return form
}

beforeEach(() => {
  db.role = 'super_admin'
  db.clubs = [{ id: 'club-0', name: 'Rotaract Club of Galle', club_code: 'RAC-009' }]
  db.inserts = []
  db.audit = []
  vi.mocked(revalidatePath).mockClear()
})

describe('createClubsBulkAction', () => {
  it('rejects a Champion and creates nothing', async () => {
    db.role = 'champion'
    const state = await createClubsBulkAction(null, csvForm(`${HEADER}\nClub A,RAC-1,Colombo,,,`))
    expect(state).toEqual({ error: 'Only Super Admins can add clubs.' })
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a Gatekeeper too', async () => {
    db.role = 'gatekeeper'
    expect(await createClubsBulkAction(null, csvForm(`${HEADER}\nClub A,RAC-1,Colombo,,,`))).toEqual({
      error: 'Only Super Admins can add clubs.',
    })
  })

  it('creates only the valid rows of a mixed file and reports every row', async () => {
    const state = await createClubsBulkAction(null, csvForm(`${HEADER}
Rotaract Club of Colombo,RAC-001,"12 Galle Rd, Colombo 03",colombo@example.com,077 123 4567,City club
Rotaract Club of Kandy,RAC-002,,,,
Rotaract Club of Matara,rac-009,Matara,,,

Rotaract Club of Jaffna,RAC-004,Jaffna,jaffna@,,
Rotaract Club of Negombo,RAC-001,Negombo,,,
Rotaract Club of Kurunegala,RAC-006,Kurunegala,,0372 222 333,`))

    expect(state).toEqual({
      results: [
        { row: 2, name: 'Rotaract Club of Colombo', success: true },
        { row: 3, name: 'Rotaract Club of Kandy', error: 'Address is required.' },
        { row: 4, name: 'Rotaract Club of Matara', error: 'Club code "rac-009" is already taken. Please choose a unique code.' },
        { row: 6, name: 'Rotaract Club of Jaffna', error: 'Enter a valid contact email, e.g. club@example.com.' },
        { row: 7, name: 'Rotaract Club of Negombo', error: 'Same club code as row 2 in this file.' },
        { row: 8, name: 'Rotaract Club of Kurunegala', success: true },
      ],
      createdCount: 2,
      failedCount: 4,
    })
    expect(db.inserts).toEqual([
      {
        name: 'Rotaract Club of Colombo', club_code: 'RAC-001', location: '12 Galle Rd, Colombo 03',
        contact_email: 'colombo@example.com', contact_phone: '+94771234567', description: 'City club', created_by: 'user-1',
      },
      {
        name: 'Rotaract Club of Kurunegala', club_code: 'RAC-006', location: 'Kurunegala',
        contact_email: null, contact_phone: '+94372222333', description: null, created_by: 'user-1',
      },
    ])
    expect(db.audit).toEqual([
      { actorId: 'user-1', action: 'club.created', entityType: 'club', entityId: 'club-2',
        details: { club_code: 'RAC-001', name: 'Rotaract Club of Colombo', source: 'bulk_csv' } },
      { actorId: 'user-1', action: 'club.created', entityType: 'club', entityId: 'club-3',
        details: { club_code: 'RAC-006', name: 'Rotaract Club of Kurunegala', source: 'bulk_csv' } },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/super-admin/clubs')
  })

  it('rejects a wrong header and creates nothing', async () => {
    const state = await createClubsBulkAction(null, csvForm('name,code,location\nClub A,RAC-1,Colombo'))
    expect(state).toEqual({ error: `The first row of the file must be exactly: ${HEADER}. Nothing was created.` })
    expect(db.inserts).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects more than 50 rows and creates nothing', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => `Club ${i},C-${i},Colombo,,,`).join('\n')
    expect(await createClubsBulkAction(null, csvForm(`${HEADER}\n${rows}`))).toEqual({
      error: 'The CSV has 51 rows — maximum is 50 per upload.',
    })
    expect(db.inserts).toHaveLength(0)
  })

  it('turns a clash only the database can see into a plain message', async () => {
    db.clubs.push({ id: 'club-y', name: 'Twin Club', club_code: null, savedMeanwhile: true })
    const state = await createClubsBulkAction(null, csvForm(`${HEADER}\nTwin Club,TW-1,Colombo,,,`))
    expect(state).toMatchObject({ results: [{ row: 2, error: 'A club with that name already exists.' }] })
  })
})

describe('createClubAction (single form) uses the same rules', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }

  it('creates a club and writes the usual audit entry', async () => {
    const state = await createClubAction(null, form({ club_code: 'RAC-020', name: 'Rotaract Club of Ella', location: 'Ella' }))
    expect(state).toEqual({ success: true })
    expect(db.audit).toEqual([
      { actorId: 'user-1', action: 'club.created', entityType: 'club', entityId: 'club-2',
        details: { club_code: 'RAC-020', name: 'Rotaract Club of Ella' } },
    ])
  })

  it('treats codes as duplicates regardless of capitals', async () => {
    const state = await createClubAction(null, form({ club_code: 'rac-009', name: 'New', location: 'Galle' }))
    expect(state?.error).toBe('Club code "rac-009" is already taken. Please choose a unique code.')
    expect(state?.values?.club_code).toBe('rac-009')
  })
})
