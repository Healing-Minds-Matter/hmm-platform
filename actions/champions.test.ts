import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet row 32: Champion form errors come back tied to the field they are
// about, so the form can show each one next to its input. Accounts are never
// really created here — every case stops before createAuthAccount().
const db = vi.hoisted(() => ({
  takenEmails: new Set<string>(),
  clubs: new Map<string, { name: string; is_active: boolean }>(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            // The caller's own profile (read by the shared guard): an active Super Admin.
            if (table === 'profiles' && column === 'id' && value === 'user-1') return { data: { role: 'super_admin', club_id: null, is_active: true } }
            if (table === 'clubs') return { data: db.clubs.get(value) ?? null }
            return { data: db.takenEmails.has(value) ? { id: 'existing' } : null }
          },
          single: async () => ({ data: table === 'clubs' ? db.clubs.get(value) ?? null : table === 'profiles' && value === CHAMP ? { role: 'champion' } : null }),
        }),
      }),
    }),
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/create-invited-user', () => ({ createAuthAccount: vi.fn() }))
vi.mock('@/lib/delegations.server', () => ({ endDelegationsForDeactivatedUser: vi.fn() }))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async (phone: string) =>
    phone === '+94771234567' ? 'This phone number is already registered to another user. Each user needs their own phone number.' : null),
  describePhoneDbError: vi.fn(() => null),
  phoneChanged: vi.fn(() => true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createChampionAction, reactivateChampionAction } from '@/actions/champions'
import { createAuthAccount } from '@/lib/create-invited-user'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const CLUB_1 = '11111111-1111-4111-8111-111111111111'
const CHAMP = '55555555-5555-4555-8555-555555555555'
const CLUB_OFF = '33333333-3333-4333-8333-333333333333'
const valid = { full_name: 'Maya Lin', email: 'maya@example.com', phone: '', club_id: CLUB_1 }

beforeEach(() => {
  db.takenEmails = new Set(['asha@example.com'])
  db.clubs = new Map([
    [CLUB_1, { name: 'Rotaract Club of Colombo', is_active: true }],
    [CLUB_OFF, { name: 'Rotaract Club of Kandy', is_active: false }],
  ])
  vi.mocked(createAuthAccount).mockClear()
})

describe('createChampionAction: field-level errors', () => {
  it('ties required-field errors to their field', async () => {
    expect((await createChampionAction(null, form({ ...valid, full_name: ' ' })))?.fieldErrors)
      .toEqual({ full_name: 'Full name is required.' })
    expect((await createChampionAction(null, form({ ...valid, email: '' })))?.fieldErrors)
      .toEqual({ email: 'Email is required.' })
    expect((await createChampionAction(null, form({ ...valid, club_id: '' })))?.fieldErrors)
      .toEqual({ club_id: 'Club assignment is required.' })
  })

  it('ties format and uniqueness errors to their field', async () => {
    const badPhone = await createChampionAction(null, form({ ...valid, phone: '12' }))
    expect(Object.keys(badPhone?.fieldErrors ?? {})).toEqual(['phone'])
    expect((await createChampionAction(null, form({ ...valid, email: 'Asha@example.com' })))?.fieldErrors)
      .toEqual({ email: 'An account with this email already exists.' })
    expect((await createChampionAction(null, form({ ...valid, phone: '077 123 4567' })))?.fieldErrors)
      .toEqual({ phone: 'This phone number is already registered to another user. Each user needs their own phone number.' })
    expect(createAuthAccount).not.toHaveBeenCalled()
  })
})

describe('reactivateChampionAction: field-level errors', () => {
  it('ties club errors to the club picker', async () => {
    expect((await reactivateChampionAction(null, form({ champion_id: CHAMP, club_id: '' })))?.fieldErrors)
      .toEqual({ club_id: 'Club assignment is required.' })
    expect((await reactivateChampionAction(null, form({ champion_id: CHAMP, club_id: CLUB_OFF })))?.fieldErrors)
      .toEqual({ club_id: 'Club "Rotaract Club of Kandy" is currently inactive. Reactivate the club first or assign an active club.' })
  })
})
