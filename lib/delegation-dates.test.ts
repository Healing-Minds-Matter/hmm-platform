import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatOrgDate, orgDayEndIso, orgDayStartIso } from '@/lib/org-date'

// Fix M: delegation dates mean whole Sri Lanka days. They used to be saved as
// midnight UTC, so a delegation started at 05:30 Sri Lanka time and ended at
// 05:30 on its end date, losing the last day.

describe('orgDayStartIso / orgDayEndIso', () => {
  it('starts the day at 00:00 Sri Lanka time (18:30 UTC the day before)', () => {
    expect(orgDayStartIso('2030-01-01')).toBe('2029-12-31T18:30:00.000Z')
  })

  it('ends the day at 23:59:59 Sri Lanka time (18:29:59 UTC the same day)', () => {
    expect(orgDayEndIso('2030-01-10')).toBe('2030-01-10T18:29:59.000Z')
  })

  it('shows the same Sri Lanka dates back on screen', () => {
    expect(formatOrgDate(orgDayStartIso('2030-01-01')!, { dateStyle: 'medium' })).toBe('1 Jan 2030')
    expect(formatOrgDate(orgDayEndIso('2030-01-10')!, { dateStyle: 'medium' })).toBe('10 Jan 2030')
  })

  it('rejects anything that is not a real YYYY-MM-DD date', () => {
    for (const bad of ['', 'tomorrow', '2030-1-1', '2030-02-30', '2030-13-01', '2030-01-01T00:00', '2030-01-01Z']) {
      expect(orgDayStartIso(bad)).toBeNull()
      expect(orgDayEndIso(bad)).toBeNull()
    }
  })
})

const db = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    },
    from: (table: string) => table === 'profiles'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'super_admin', club_id: null, is_active: true, must_change_password: false } }) }) }) }
      : { insert: async (row: Record<string, unknown>) => { db.inserts.push(row); return { error: null } } },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createDelegationAction } from '@/actions/permissions'

const DELEGATOR = '00000000-0000-4000-8000-000000000002'
const DELEGATE = '00000000-0000-4000-8000-000000000003'

function form(startsAt: string, endsAt: string) {
  const f = new FormData()
  f.set('delegator_id', DELEGATOR)
  f.set('delegate_id', DELEGATE)
  f.set('starts_at', startsAt)
  f.set('ends_at', endsAt)
  return f
}

beforeEach(() => { db.inserts = [] })

describe('createDelegationAction saves Sri Lanka days', () => {
  it('saves the start at 00:00 and the end at 23:59:59 Sri Lanka time', async () => {
    expect(await createDelegationAction(null, form('2030-01-01', '2030-01-02'))).toEqual({ success: true })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]).toMatchObject({
      delegator_id: DELEGATOR,
      delegate_id: DELEGATE,
      starts_at: '2029-12-31T18:30:00.000Z',
      ends_at: '2030-01-02T18:29:59.000Z',
    })
  })

  it('refuses dates a modified browser could send, and saves nothing', async () => {
    expect((await createDelegationAction(null, form('2030-02-30', '2030-03-01')))?.fieldErrors)
      .toEqual({ starts_at: 'Enter a valid start date.' })
    expect((await createDelegationAction(null, form('2030-01-01', '2030-01-02T23:00Z')))?.fieldErrors)
      .toEqual({ ends_at: 'Enter a valid end date.' })
    expect((await createDelegationAction(null, form('2030-01-02', '2030-01-02')))?.fieldErrors)
      .toEqual({ ends_at: 'End date must be after the start date.' })
    expect(db.inserts).toHaveLength(0)
  })
})
