import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression checks for the Gatekeeper bulk upload after it moved to the
// shared CSV reader (lib/csv.ts). Only file-level and row-level checks that
// run before any account is created are exercised, so nothing here needs a
// real auth or email service.
const caller = vi.hoisted(() => ({ role: 'super_admin' as string, club_id: null as string | null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: caller }) }) }) }),
  }),
}))
// Every email is reported as already registered, so a row that passes the
// file checks stops there instead of creating an account.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing' } }) }) }) }),
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/invite-gatekeeper', () => ({
  createGatekeeperWithTempPassword: vi.fn(),
  resendGatekeeperWelcomeEmail: vi.fn(),
}))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(), describePhoneDbError: vi.fn(), phoneChanged: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createGatekeepersBulkAction } from '@/actions/gatekeepers'
import { createGatekeeperWithTempPassword } from '@/lib/invite-gatekeeper'

const HEADER = 'full_name,email,phone,club_id,certification_date'

function csvForm(text: string) {
  const form = new FormData()
  form.set('csv_file', new File([text], 'gatekeepers.csv', { type: 'text/csv' }))
  return form
}

beforeEach(() => {
  caller.role = 'super_admin'
  caller.club_id = null
})

describe('createGatekeepersBulkAction (after the shared CSV refactor)', () => {
  it('keeps its file-level messages', async () => {
    expect(await createGatekeepersBulkAction(null, new FormData())).toEqual({ error: 'Select a CSV file to upload.' })
    expect(await createGatekeepersBulkAction(null, csvForm('\n'))).toEqual({ error: 'The CSV file is empty.' })
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n`))).toEqual({ error: 'The CSV file has no data rows.' })
    const rows = Array.from({ length: 51 }, (_, i) => `GK ${i},gk${i}@example.com,07712345${String(i).padStart(2, '0')},c,2025-01-01`)
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\n${rows.join('\n')}`))).toEqual({
      error: 'The CSV has 51 rows — maximum is 50 per upload.',
    })
  })

  it('still requires club_id in a Super Admin file', async () => {
    expect(await createGatekeepersBulkAction(null, csvForm('full_name,email,phone,certification_date\nA,a@example.com,0771234567,2025-01-01'))).toEqual({
      error: 'CSV header must include: full_name, email, phone, club_id, certification_date.',
    })
  })

  it('still rejects callers who are not Super Admins or Champions', async () => {
    caller.role = 'gatekeeper'
    expect(await createGatekeepersBulkAction(null, csvForm(`${HEADER}\nA,a@example.com,0771234567,c,2025-01-01`))).toEqual({
      error: 'Not authorized.',
    })
  })

  it('checks each row before creating any account', async () => {
    const state = await createGatekeepersBulkAction(null, csvForm(`﻿${HEADER}
Maya Lin,,0771234567,club-1,2025-01-01

Ravi Perera,ravi@example.com,0771234568,club-1,2999-01-01
Asha Silva,asha@example.com,0771234569,club-1,2025-01-01
Nimal Fernando,nimal@example.com,077 123 4569,club-1,2025-01-01`))

    expect(state).toMatchObject({
      results: [
        { row: 2, error: 'Missing required field(s).' },
        { row: 4, email: 'ravi@example.com', error: 'Certification date cannot be in the future.' },
        { row: 5, email: 'asha@example.com', error: 'An account with this email already exists.' },
        { row: 6, email: 'nimal@example.com', error: 'Same phone number as row 5 in this file. Each user needs their own phone number.' },
      ],
    })
    expect(createGatekeeperWithTempPassword).not.toHaveBeenCalled()
  })
})
