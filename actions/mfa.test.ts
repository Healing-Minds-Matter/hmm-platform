import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review Finding 8: a newly set-up authenticator is audited by the server,
// from Supabase's own record of the caller's factors — once per factor, and
// only for a verified (aal2) session. Nothing from the browser is trusted.

const s = vi.hoisted(() => ({
  userId: 'sa-1' as string | null,
  aal: 'aal2' as 'aal1' | 'aal2',
  factors: [] as { id: string; status: string }[],
  logged: [] as { action: string; entity_id: string; details: unknown }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: s.userId ? { id: s.userId } : null } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: s.aal, nextLevel: 'aal2' }, error: null }),
        listFactors: async () => ({ data: { totp: s.factors, all: s.factors }, error: null }),
      },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: (_c: string, action: string) => ({ eq: async (_c2: string, id: string) => ({ data: s.logged.filter(l => l.action === action && l.entity_id === id) }) }) }) }),
  }),
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(async (e: { action: string; entityId: string; details: unknown }) => { s.logged.push({ action: e.action, entity_id: e.entityId, details: e.details }) }),
}))

import { recordMfaEnrolledAction } from '@/actions/mfa'
import { writeAuditLog } from '@/lib/audit'

beforeEach(() => {
  s.userId = 'sa-1'; s.aal = 'aal2'; s.factors = []; s.logged = []
  vi.mocked(writeAuditLog).mockClear()
})

describe('recordMfaEnrolledAction', () => {
  it('not signed in → nothing written', async () => {
    s.userId = null
    await recordMfaEnrolledAction()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('password-only (aal1) session → nothing written, even if the browser claims a set-up', async () => {
    s.aal = 'aal1'; s.factors = [{ id: 'f1', status: 'verified' }]
    await recordMfaEnrolledAction()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('no verified authenticator → nothing written', async () => {
    s.factors = [{ id: 'f1', status: 'unverified' }]
    await recordMfaEnrolledAction()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
  it('verified authenticator → one entry, by the real caller', async () => {
    s.factors = [{ id: 'f1', status: 'verified' }]
    await recordMfaEnrolledAction()
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'sa-1', action: 'auth.mfa_enrolled', entityId: 'sa-1', details: { factor_id: 'f1', factor_type: 'totp' } }))
  })
  it('called again for the same authenticator → no second entry', async () => {
    s.factors = [{ id: 'f1', status: 'verified' }]
    await recordMfaEnrolledAction()
    await recordMfaEnrolledAction()
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
  })
})
