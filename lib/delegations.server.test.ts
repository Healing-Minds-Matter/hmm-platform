import { describe, expect, it, vi } from 'vitest'

// Security Finding 5: every export of a 'use server' file is a public endpoint.
// The delegation clean-up (service-role key, caller-supplied audit actor) must
// not be one of them.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

describe('endDelegationsForDeactivatedUser', () => {
  it('is not exported from a server-action file', async () => {
    const actions = await import('@/actions/permissions')
    expect('endDelegationsForDeactivatedUser' in actions).toBe(false)
  })
  it('lives in a server-only module', async () => {
    const lib = await import('@/lib/delegations.server')
    expect(typeof lib.endDelegationsForDeactivatedUser).toBe('function')
  })
})
