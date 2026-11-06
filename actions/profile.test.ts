import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet row 32: My Profile gets each error back tied to the field it is
// about, so it can be shown next to that input.
const db = vi.hoisted(() => ({ phoneTaken: false }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { phone: null, role: 'super_admin' } }) }) }),
    }),
  }),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/phone-uniqueness.server', () => ({
  checkPhoneAvailable: vi.fn(async () =>
    db.phoneTaken ? 'This phone number is already registered to another user. Each user needs their own phone number.' : null),
  describePhoneDbError: vi.fn(() => null),
  phoneChanged: vi.fn(() => true),
}))

import { updateProfileAction } from '@/actions/profile'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => { db.phoneTaken = false })

describe('updateProfileAction: field-level errors', () => {
  it('ties a missing or too-long name to the name field', async () => {
    expect((await updateProfileAction(null, form({ full_name: '' })))?.fieldErrors).toEqual({ full_name: 'Full name is required.' })
    expect((await updateProfileAction(null, form({ full_name: 'x'.repeat(101) })))?.fieldErrors)
      .toEqual({ full_name: 'Full name must be 100 characters or fewer.' })
  })

  it('ties phone format and uniqueness errors to the phone field', async () => {
    const bad = await updateProfileAction(null, form({ full_name: 'Asha', phone: '12' }))
    expect(Object.keys(bad?.fieldErrors ?? {})).toEqual(['phone'])
    db.phoneTaken = true
    expect((await updateProfileAction(null, form({ full_name: 'Asha', phone: '0771234567' })))?.fieldErrors)
      .toEqual({ phone: 'This phone number is already registered to another user. Each user needs their own phone number.' })
  })

  it('ties length limits on the optional fields to those fields', async () => {
    expect((await updateProfileAction(null, form({ full_name: 'Asha', title: 't'.repeat(151) })))?.fieldErrors)
      .toEqual({ title: 'Job title must be 150 characters or fewer.' })
  })
})
