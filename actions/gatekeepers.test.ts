import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Gatekeeper bulk upload after moving to the shared CSV reader and the
// two-step check/save flow. Accounts are never really created here: the
// "save" tests use emails the fake database already knows, so every row
// stops before account creation.
const db = vi.hoisted(() => ({
  caller: { role: 'super_admin' as string, club_id: null as string | null },
  takenEmails: new Set<string>(),
  clubs: new Map<string, { name: string; is_active: boolean }>(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.caller }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
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
vi.mock('@/lib/invite-gatekeeper', () => ({
  createGatekeeperWithTempPassword: vi.fn(),
  resendGatekeeperWelcomeEmail: vi.fn(),
}))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () => null), describePhoneDbError: vi.fn(), phoneChanged: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createGatekeepersBulkAction } from '@/actions/gatekeepers'
import { createGatekeeperWithTempPassword } from '@/lib/invite-gatekeeper'

const HEADER = 'full_name,email,phone,club_id,certification_date'

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
  vi.mocked(createGatekeeperWithTempPassword).mockClear()
})

describe('createGatekeepersBulkAction: file-level checks', () => {
  it('keeps its file-level messages', async () => {
    expect(await createGatekeepersBulkAction(null, new FormData())).toEqual({ error: 'Select a CSV file to upload.' })
    expect(await createGatekeepersBulkAction(null, csvForm('\n'))).toEqual({ error: 'The CSV file is empty.' })
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n`))).toEqual({ error: 'The CSV file has no data rows.' })
    const rows = Array.from({ length: 51 }, (_, i) => `GK ${i},gk${i}@example.com,07712345${String(i).padStart(2, '0')},c,2025-01-01`)
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n${rows.join('\n')}`))).toEqual({
      error: 'The CSV has 51 rows — maximum is 50 per upload.',
    })
  })

  it('still requires club_id in a Super Admin file, but not a Champion one', async () => {
    const noClub = 'full_name,email,phone,certification_date\nA,a@example.com,0771234567,2025-01-01'
    expect(await createGatekeepersBulkAction(null, csvForm(noClub))).toEqual({
      error: 'CSV header must include: full_name, email, phone, club_id, certification_date.',
    })
    db.caller = { role: 'champion', club_id: 'club-1' }
    expect(await createGatekeepersBulkAction(null, csvForm(noClub, 'check'))).toMatchObject({
      results: [{ row: 2, status: 'ready' }],
    })
  })

  it('still rejects callers who are not Super Admins or Champions', async () => {
    db.caller = { role: 'gatekeeper', club_id: null }
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\nA,a@example.com,0771234567,club-1,2025-01-01`))).toEqual({
      error: 'Not authorized.',
    })
  })
})

describe('createGatekeepersBulkAction: check step', () => {
  it('runs every check, including the database ones, without creating accounts', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`﻿${HEADER}
Maya Lin,maya@example.com,0771234561,club-1,2025-01-01
Asha Silva,asha@example.com,0771234562,club-1,2025-01-01
Ravi Perera,ravi@example.com,0771234563,club-off,2025-01-01
Kamal Dias,kamal@example.com,0771234564,no-such-club,2025-01-01

Nimal Fernando,MAYA@example.com,0771234565,club-1,2025-01-01
Sunil Jay,sunil@example.com,077 123 4561,club-1,2025-01-01
Dilani Raj,dilani@example.com,0771234567,club-1,2999-01-01`, 'check'))

    expect(state).toEqual({
      intent: 'check',
      results: [
        { row: 2, label: 'maya@example.com', status: 'ready' },
        { row: 3, label: 'asha@example.com', status: 'failed', error: 'An account with this email already exists.' },
        { row: 4, label: 'ravi@example.com', status: 'failed', error: 'Club "Rotaract Club of Kandy" is currently inactive. Reactivate it first or choose a different club.' },
        { row: 5, label: 'kamal@example.com', status: 'failed', error: 'The selected club could not be found. Double-check the club_id and try again.' },
        { row: 7, label: 'maya@example.com', status: 'failed', error: 'Same email as row 2 in this file.' },
        { row: 8, label: 'sunil@example.com', status: 'failed', error: 'Same phone number as row 2 in this file. Each user needs their own phone number.' },
        { row: 9, label: 'dilani@example.com', status: 'failed', error: 'Certification date cannot be in the future.' },
      ],
    })
    expect(createGatekeeperWithTempPassword).not.toHaveBeenCalled()
  })
})

describe('createGatekeepersBulkAction: save step', () => {
  it('leaves duplicates within the file to the database check', async () => {
    // Rows are saved one by one, so a repeat of an earlier row meets it in
    // the database ("already exists") instead of "same as row N", which
    // would point at a row missing from the "failed rows" file.
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Asha Silva,asha@example.com,0771234569,club-1,2025-01-01
Asha S,asha@example.com,0771234570,club-1,2025-01-01`))
    expect(state).toMatchObject({
      results: [
        { row: 2, error: 'An account with this email already exists.' },
        { row: 3, error: 'An account with this email already exists.' },
      ],
    })
  })

  it('checks each row again before creating any account', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`${HEADER}
Maya Lin,,0771234567,club-1,2025-01-01

Asha Silva,asha@example.com,0771234569,club-1,2025-01-01`))

    expect(state).toEqual({
      intent: 'save',
      results: [
        { row: 2, label: '(missing)', status: 'failed', error: 'Missing required field(s).' },
        { row: 4, label: 'asha@example.com', status: 'failed', error: 'An account with this email already exists.' },
      ],
    })
    expect(createGatekeeperWithTempPassword).not.toHaveBeenCalled()
  })
})
