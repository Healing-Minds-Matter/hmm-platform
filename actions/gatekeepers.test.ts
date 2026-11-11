import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Gatekeeper bulk upload after moving to the shared CSV reader and the
// two-step check/save flow. Accounts are never really created here: the
// "save" tests use emails the fake database already knows, so every row
// stops before account creation.
const db = vi.hoisted(() => ({
  caller: { role: 'super_admin' as string, club_id: null as string | null },
  takenEmails: new Set<string>(),
  clubs: new Map<string, { name: string; is_active: boolean }>(),
  takenPhones: [] as { phone: string }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: (_column: string, value: string) => ({
      single: async () => ({ data: db.caller }),
      // The shared guard reads the caller ('user-1'); the Gatekeeper actions then read the target Gatekeeper.
      maybeSingle: async () => ({ data: value === 'user-1' ? { ...db.caller, is_active: true } : { role: 'gatekeeper', club_id: null } }),
    }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async (_column: string, values: string[]) => ({
          data: values.filter(email => db.takenEmails.has(email)).map(email => ({ email })),
          error: null,
        }),
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({
            data: table === 'profiles'
              ? (db.takenEmails.has(value) ? { id: 'existing' } : null)
              : db.clubs.get(value) ?? null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/create-invited-user', () => ({
  createAuthAccount: vi.fn(),
}))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null), describePhoneDbError: vi.fn(), phoneChanged: vi.fn(),
  loadPhoneOwners: vi.fn(async () => db.takenPhones),
  findPhoneClash: (phone: string, owners: { phone: string }[]) =>
    owners.some(o => o.phone === phone) ? 'This phone number is already registered to another user. Each user needs their own phone number.' : null,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createGatekeeperAction, createGatekeepersBulkAction, reactivateGatekeeperAction, updateGatekeeperAction } from '@/actions/gatekeepers'
import { createAuthAccount } from '@/lib/create-invited-user'
import { loadPhoneOwners } from '@/lib/phone-uniqueness.server'
import { RETIRED_CERTIFICATION_DATE_MESSAGE } from '@/lib/gatekeeper-csv'

const GK_ID = '66666666-6666-4666-8666-666666666666'
const HEADER = 'full_name,email,phone,club_id'

function csvForm(text: string, intent: 'check' | 'save' = 'save') {
  const form = new FormData()
  form.set('csv_file', new File([text], 'gatekeepers.csv', { type: 'text/csv' }))
  form.set('intent', intent)
  return form
}

beforeEach(() => {
  db.caller = { role: 'super_admin', club_id: null }
  db.takenEmails = new Set(['asha@example.com'])
  db.clubs = new Map([
    ['club-1', { name: 'Rotaract Club of Colombo', is_active: true }],
    ['club-off', { name: 'Rotaract Club of Kandy', is_active: false }],
  ])
  db.takenPhones = []
  vi.mocked(createAuthAccount).mockClear()
  vi.mocked(loadPhoneOwners).mockClear()
})

describe('createGatekeepersBulkAction: file-level checks', () => {
  it('keeps its file-level messages', async () => {
    expect(await createGatekeepersBulkAction(null, new FormData())).toEqual({ error: 'Select a CSV file to upload.' })
    expect(await createGatekeepersBulkAction(null, csvForm('\n'))).toEqual({ error: 'The CSV file is empty.' })
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n`))).toEqual({ error: 'The CSV file has no data rows.' })
    const rows = Array.from({ length: 51 }, (_, i) => `GK ${i},gk${i}@example.com,07712345${String(i).padStart(2, '0')},c`)
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n${rows.join('\n')}`))).toEqual({
      error: 'The CSV has 51 rows — maximum is 50 per upload.',
    })
  })

  it('still requires club_id in a Super Admin file, but not a Champion one', async () => {
    const noClub = 'full_name,email,phone\nA,a@example.com,0771234567'
    expect(await createGatekeepersBulkAction(null, csvForm(noClub))).toEqual({
      error: 'CSV header must include: full_name, email, phone, club_id.',
    })
    db.caller = { role: 'champion', club_id: 'club-1' }
    expect(await createGatekeepersBulkAction(null, csvForm(noClub, 'check'))).toMatchObject({
      results: [{ row: 2, status: 'ready' }],
    })
  })

  it('still rejects callers who are not Super Admins or Champions', async () => {
    db.caller = { role: 'gatekeeper', club_id: null }
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\nA,a@example.com,0771234567,club-1`))).toEqual({
      error: 'Only Super Admins and Champions can add Gatekeepers.',
    })
  })
})

describe('createGatekeepersBulkAction: check step', () => {
  it('runs every check, including the database ones, without creating accounts', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`﻿${HEADER}
Maya Lin,maya@example.com,0771234561,club-1
Asha Silva,asha@example.com,0771234562,club-1
Ravi Perera,ravi@example.com,0771234563,club-off
Kamal Dias,kamal@example.com,0771234564,no-such-club

Nimal Fernando,MAYA@example.com,0771234565,club-1
Sunil Jay,sunil@example.com,077 123 4561,club-1
Dilani Raj,dilani@example.com,0771234567,club-1`, 'check'))

    expect(state).toEqual({
      intent: 'check',
      results: [
        { row: 2, label: 'maya@example.com', status: 'ready' },
        { row: 3, label: 'asha@example.com', status: 'failed', error: 'An account with this email already exists.' },
        { row: 4, label: 'ravi@example.com', status: 'failed', error: 'Club "Rotaract Club of Kandy" is currently inactive. Reactivate it first or choose a different club.' },
        { row: 5, label: 'kamal@example.com', status: 'failed', error: 'The selected club could not be found. Double-check the club_id and try again.' },
        { row: 7, label: 'maya@example.com', status: 'failed', error: 'Same email as row 2 in this file.' },
        { row: 8, label: 'sunil@example.com', status: 'failed', error: 'Same phone number as row 2 in this file. Each user needs their own phone number.' },
        { row: 9, label: 'dilani@example.com', status: 'ready' },
      ],
    })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('refuses a file with the old certification_date column instead of dropping its dates', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER},certification_date
Maya Lin,maya@example.com,0771234561,club-1,2025-01-01`, 'check'))
    expect(state).toEqual({ error: RETIRED_CERTIFICATION_DATE_MESSAGE })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('reads every user\'s phone number once per request, not once per row', async () => {
    db.takenPhones = [{ phone: '+94771234562' }]
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,maya@example.com,0771234561,club-1
Ravi Perera,ravi@example.com,0771234562,club-1
Kamal Dias,kamal@example.com,0771234563,club-1`, 'check'))

    expect(state?.results).toEqual([
      { row: 2, label: 'maya@example.com', status: 'ready' },
      { row: 3, label: 'ravi@example.com', status: 'failed', error: 'This phone number is already registered to another user. Each user needs their own phone number.' },
      { row: 4, label: 'kamal@example.com', status: 'ready' },
    ])
    expect(loadPhoneOwners).toHaveBeenCalledTimes(1)
  })
})

describe('createGatekeepersBulkAction: save step', () => {
  it('leaves duplicates within the file to the database check', async () => {
    // Rows are saved one by one, so a repeat of an earlier row meets it in
    // the database ("already exists") instead of "same as row N", which
    // would point at a row missing from the "failed rows" file.
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Asha Silva,asha@example.com,0771234569,club-1
Asha S,asha@example.com,0771234570,club-1`))
    expect(state).toMatchObject({
      results: [
        { row: 2, error: 'An account with this email already exists.' },
        { row: 3, error: 'An account with this email already exists.' },
      ],
    })
  })

  it('checks each row again before creating any account', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,,0771234567,club-1

Asha Silva,asha@example.com,0771234569,club-1`))

    expect(state).toEqual({
      intent: 'save',
      results: [
        { row: 2, label: '(missing)', status: 'failed', error: 'Missing required field(s).' },
        { row: 4, label: 'asha@example.com', status: 'failed', error: 'An account with this email already exists.' },
      ],
    })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

describe('createGatekeepersBulkAction: in batches', () => {
  const FILE = `${HEADER}
Maya Lin,maya@example.com,0771234561,club-1
Ravi Perera,ravi@example.com,0771234562,club-1
Nimal Fernando,MAYA@example.com,0771234563,club-1
Sunil Jay,sunil@example.com,077 123 4562,club-1
Dilani Raj,dilani@example.com,0771234565,club-1`

  const batchForm = (intent: 'check' | 'save', lines: number[]) => {
    const form = csvForm(FILE, intent)
    form.set('lines', lines.join(','))
    return form
  }

  it('check: reports only the batch, but still catches duplicates of rows in earlier batches', async () => {
    expect(await createGatekeepersBulkAction(null, batchForm('check', [4, 5, 6]))).toEqual({
      intent: 'check',
      results: [
        { row: 4, label: 'maya@example.com', status: 'failed', error: 'Same email as row 2 in this file.' },
        { row: 5, label: 'sunil@example.com', status: 'failed', error: 'Same phone number as row 3 in this file. Each user needs their own phone number.' },
        { row: 6, label: 'dilani@example.com', status: 'ready' },
      ],
    })
  })

  it('save: handles only the batch rows', async () => {
    db.takenEmails = new Set(['maya@example.com', 'ravi@example.com', 'sunil@example.com', 'dilani@example.com'])
    const state = await createGatekeepersBulkAction(null, batchForm('save', [2, 3]))
    expect(state?.results?.map(r => r.row)).toEqual([2, 3])
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
})
})

// Sheet row 32: the single Add / Edit / Reactivate forms get each error back
// tied to the field it is about, so it can be shown next to that input.
describe('single-Gatekeeper actions: field-level errors', () => {
  function form(fields: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }
  const valid = { full_name: 'Maya Lin', email: 'maya@example.com', phone: '0771234561', club_id: 'club-1' }

  it('createGatekeeperAction ties required-field errors to their field', async () => {
    expect((await createGatekeeperAction(null, form({ ...valid, full_name: '' })))?.fieldErrors)
      .toEqual({ full_name: 'Full name is required.' })
    expect((await createGatekeeperAction(null, form({ ...valid, phone: '' })))?.fieldErrors)
      .toEqual({ phone: 'Phone number is required.' })
    expect((await createGatekeeperAction(null, form({ ...valid, club_id: '' })))?.fieldErrors)
      .toEqual({ club_id: 'Assigned club is required.' })
  })

  it('createGatekeeperAction ties uniqueness and club errors to their field', async () => {
    expect((await createGatekeeperAction(null, form({ ...valid, email: 'asha@example.com' })))?.fieldErrors)
      .toEqual({ email: 'An account with this email already exists.' })
    db.takenPhones = [{ phone: '+94771234561' }]
    expect((await createGatekeeperAction(null, form(valid)))?.fieldErrors)
      .toEqual({ phone: 'This phone number is already registered to another user. Each user needs their own phone number.' })
    db.takenPhones = []
    expect((await createGatekeeperAction(null, form({ ...valid, club_id: 'club-off' })))?.fieldErrors)
      .toEqual({ club_id: 'Club "Rotaract Club of Kandy" is currently inactive. Reactivate it first or choose a different club.' })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('a Champion’s missing club stays a form-level error (they have no club picker)', async () => {
    db.caller = { role: 'champion', club_id: null }
    expect(await createGatekeeperAction(null, form(valid))).toEqual({ error: 'Your account has no assigned club.' })
  })

  it('updateGatekeeperAction and reactivateGatekeeperAction tie errors to their field', async () => {
    expect((await updateGatekeeperAction(null, form({ ...valid, gatekeeper_id: GK_ID, version: '1', email: '' })))?.fieldErrors)
      .toEqual({ email: 'Email is required.' })
    const badPhone = await updateGatekeeperAction(null, form({ ...valid, gatekeeper_id: GK_ID, version: '1', phone: '12' }))
    expect(Object.keys(badPhone?.fieldErrors ?? {})).toEqual(['phone'])
    expect((await reactivateGatekeeperAction(null, form({ gatekeeper_id: GK_ID, club_id: '' })))?.fieldErrors)
      .toEqual({ club_id: 'Club assignment is required.' })
  })
})
