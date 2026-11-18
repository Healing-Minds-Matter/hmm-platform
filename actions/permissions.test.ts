import { describe, expect, it, vi } from 'vitest'

// Sheet row 32: the Create Group and Create Delegation forms get each error
// back tied to the field it is about, so it can be shown next to that input.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      // A verified Super Admin (Review Findings 8 and 9: the guard runs first).
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }) },
    },
    from: (table: string) => table === 'profiles'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'super_admin', club_id: null, is_active: true, must_change_password: false } }) }) }) }
      : ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createDelegationAction, createGroupAction } from '@/actions/permissions'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('createGroupAction: field-level errors', () => {
  it('ties a missing or already-used name to the name field', async () => {
    expect((await createGroupAction(null, form({ name: ' ' })))?.fieldErrors).toEqual({ name: 'Group name is required.' })
    expect((await createGroupAction(null, form({ name: 'Leads' })))?.fieldErrors)
      .toEqual({ name: 'A group named "Leads" already exists.' })
  })
})

describe('createDelegationAction: field-level errors', () => {
  const valid = { delegator_id: 'u1', delegate_id: 'u2', starts_at: '2030-01-01', ends_at: '2030-01-10' }

  it('ties required-field errors to their field', async () => {
    expect((await createDelegationAction(null, form({ ...valid, delegator_id: '' })))?.fieldErrors)
      .toEqual({ delegator_id: 'Select the delegator (the person going on leave).' })
    expect((await createDelegationAction(null, form({ ...valid, delegate_id: '' })))?.fieldErrors)
      .toEqual({ delegate_id: 'Select the delegate (the person covering).' })
    expect((await createDelegationAction(null, form({ ...valid, ends_at: '' })))?.fieldErrors)
      .toEqual({ ends_at: 'End date is required.' })
  })

  it('ties same-person and date-order errors to the field to change', async () => {
    expect((await createDelegationAction(null, form({ ...valid, delegate_id: 'u1' })))?.fieldErrors)
      .toEqual({ delegate_id: 'Delegator and delegate must be different people.' })
    expect((await createDelegationAction(null, form({ ...valid, ends_at: '2029-12-31' })))?.fieldErrors)
      .toEqual({ ends_at: 'End date must be after the start date.' })
  })
})
