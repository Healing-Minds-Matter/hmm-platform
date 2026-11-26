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
  // What the club-code lookup (a select on clubs with no filter) returns.
  clubCodes: { data: [] as { id: string; club_code: string; is_active: boolean }[] | null, error: null as { message: string } | null },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      // A verified (aal2) session, as a Super Admin has after two-step verification (Review Finding 8).
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    },
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
        // Awaiting select() directly is the club-code lookup.
        then: (resolve: (v: unknown) => unknown) => resolve(table === 'clubs' ? db.clubCodes : { data: [], error: null }),
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
    ['11111111-1111-4111-8111-111111111111', { name: 'Rotaract Club of Colombo', is_active: true }],
    ['22222222-2222-4222-8222-222222222222', { name: 'Rotaract Club of Kandy', is_active: false }],
  ])
  db.takenPhones = []
  db.clubCodes = { data: [], error: null }
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
    db.caller = { role: 'champion', club_id: '11111111-1111-4111-8111-111111111111' }
    expect(await createGatekeepersBulkAction(null, csvForm(noClub, 'check'))).toMatchObject({
      results: [{ row: 2, status: 'ready' }],
    })
  })

  it('still rejects callers who are not Super Admins or Champions', async () => {
    db.caller = { role: 'gatekeeper', club_id: null }
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\nA,a@example.com,0771234567,11111111-1111-4111-8111-111111111111`))).toEqual({
      error: 'Only Super Admins and Champions can add Gatekeepers.',
    })
  })
})

describe('createGatekeepersBulkAction: check step', () => {
  it('runs every check, including the database ones, without creating accounts', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`﻿${HEADER}
Maya Lin,maya@example.com,0771234561,11111111-1111-4111-8111-111111111111
Asha Silva,asha@example.com,0771234562,11111111-1111-4111-8111-111111111111
Ravi Perera,ravi@example.com,0771234563,22222222-2222-4222-8222-222222222222
Kamal Dias,kamal@example.com,0771234564,33333333-3333-4333-8333-333333333333

Nimal Fernando,MAYA@example.com,0771234565,11111111-1111-4111-8111-111111111111
Sunil Jay,sunil@example.com,077 123 4561,11111111-1111-4111-8111-111111111111
Dilani Raj,dilani@example.com,0771234567,11111111-1111-4111-8111-111111111111`, 'check'))

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
Maya Lin,maya@example.com,0771234561,11111111-1111-4111-8111-111111111111,2025-01-01`, 'check'))
    expect(state).toEqual({ error: RETIRED_CERTIFICATION_DATE_MESSAGE })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('reads every user\'s phone number once per request, not once per row', async () => {
    db.takenPhones = [{ phone: '+94771234562' }]
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,maya@example.com,0771234561,11111111-1111-4111-8111-111111111111
Ravi Perera,ravi@example.com,0771234562,11111111-1111-4111-8111-111111111111
Kamal Dias,kamal@example.com,0771234563,11111111-1111-4111-8111-111111111111`, 'check'))

    expect(state?.results).toEqual([
      { row: 2, label: 'maya@example.com', status: 'ready' },
      { row: 3, label: 'ravi@example.com', status: 'failed', error: 'This phone number is already registered to another user. Each user needs their own phone number.' },
      { row: 4, label: 'kamal@example.com', status: 'ready' },
    ])
    expect(loadPhoneOwners).toHaveBeenCalledTimes(1)
  })
})

describe('createGatekeepersBulkAction: save step', () => {
  it('names a duplicate within the file in the save step too (Review Finding 13j)', async () => {
    // The whole file is compared in both steps, so a repeat says which row
    // it repeats; the first row still gets the database's answer.
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Asha Silva,asha@example.com,0771234569,11111111-1111-4111-8111-111111111111
Asha S,asha@example.com,0771234570,11111111-1111-4111-8111-111111111111`))
    expect(state).toMatchObject({
      results: [
        { row: 2, error: 'An account with this email already exists.' },
        { row: 3, error: 'Same email as row 2 in this file.' },
      ],
    })
  })

  it('checks each row again before creating any account', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,,0771234567,11111111-1111-4111-8111-111111111111

Asha Silva,asha@example.com,0771234569,11111111-1111-4111-8111-111111111111`))

    expect(state).toEqual({
      intent: 'save',
      results: [
        { row: 2, label: '(missing)', status: 'failed', error: 'Email is required.' },
        { row: 4, label: 'asha@example.com', status: 'failed', error: 'An account with this email already exists.' },
      ],
    })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

describe('createGatekeepersBulkAction: club codes', () => {
  it('stops the request with one message when the club codes can\'t be loaded', async () => {
    db.clubCodes = { data: null, error: { message: 'connection reset' } }
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,maya@example.com,0771234561,COL-CA
Ravi Perera,ravi@example.com,0771234562,KAN-CA`, 'check'))
    expect(state).toEqual({ error: "Couldn't check club codes right now. Please try again." })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })

  it('uses the active club when an inactive club shares its code, and refuses a code two active clubs share', async () => {
    db.clubCodes = {
      data: [
        { id: '22222222-2222-4222-8222-222222222222', club_code: 'COL-CA', is_active: false },
        { id: '11111111-1111-4111-8111-111111111111', club_code: 'col-ca', is_active: true },
        { id: '33333333-3333-4333-8333-333333333333', club_code: 'DUP', is_active: true },
        { id: '44444444-4444-4444-8444-444444444444', club_code: 'DUP', is_active: true },
      ],
      error: null,
    }
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,maya@example.com,0771234561,COL-CA
Ravi Perera,ravi@example.com,0771234562,DUP`, 'check'))
    expect(state).toEqual({
      intent: 'check',
      results: [
        { row: 2, label: 'maya@example.com', status: 'ready' },
        { row: 3, label: 'ravi@example.com', status: 'failed', error: 'More than one club has the code "DUP". Use the club\'s ID instead.' },
      ],
    })
  })
})

describe('createGatekeepersBulkAction: in batches', () => {
  const FILE = `${HEADER}
Maya Lin,maya@example.com,0771234561,11111111-1111-4111-8111-111111111111
Ravi Perera,ravi@example.com,0771234562,11111111-1111-4111-8111-111111111111
Nimal Fernando,MAYA@example.com,0771234563,11111111-1111-4111-8111-111111111111
Sunil Jay,sunil@example.com,077 123 4562,11111111-1111-4111-8111-111111111111
Dilani Raj,dilani@example.com,0771234565,11111111-1111-4111-8111-111111111111`

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
  const valid = { full_name: 'Maya Lin', email: 'maya@example.com', phone: '0771234561', club_id: '11111111-1111-4111-8111-111111111111' }

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
    expect((await createGatekeeperAction(null, form({ ...valid, club_id: '22222222-2222-4222-8222-222222222222' })))?.fieldErrors)
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
