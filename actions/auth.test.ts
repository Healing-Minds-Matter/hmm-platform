import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet row 32: Reset Password, Change Password and Change Email get each
// error back tied to the field it is about. (Login keeps its deliberately
// generic "Invalid email or password." — it is not covered here.)
const db = vi.hoisted(() => ({
  reused: false,
  signInError: null as { message: string } | null,
  sessionSignIns: 0,
  verifierSignIns: 0,
  updateError: null as { message: string; code?: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'admin@example.com' } } }),
      signInWithPassword: async () => { db.sessionSignIns++; return { error: db.signInError } },
      updateUser: async () => ({ error: db.updateError }),
      signOut: async () => ({}),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { full_name: 'Asha Silva', email: 'admin@example.com', role: 'super_admin' } }) }),
      }),
    }),
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithPassword: async () => { db.verifierSignIns++; return { error: db.signInError } }, signOut: async () => ({}) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }) }))
vi.mock('@/lib/email-sync.server', () => ({ syncProfileEmail: vi.fn() }))
vi.mock('@/lib/password-reset-grant.server', () => ({
  RESET_GRANT_COOKIE: 'g', RESET_GRANT_MAX_AGE_SECONDS: 60, RESET_PORTAL_COOKIE: 'p', hasResetGrant: async () => true,
}))
vi.mock('@/lib/password-history.server', () => ({
  isPasswordReused: vi.fn(async () => db.reused), recordPasswordHash: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), delete: vi.fn() }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { changePasswordAction, requestEmailChangeAction, resetPasswordAction } from '@/actions/auth'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const STRONG = 'Tr0ub4dor&Zebra'

beforeEach(() => {
  db.reused = false
  db.signInError = null
  db.sessionSignIns = 0
  db.verifierSignIns = 0
  db.updateError = null
})

describe('Review Finding 8: two-step verification is kept / asked for', () => {
  it('Change Password checks the current password with a separate client, so the verified session isn’t replaced', async () => {
    const r = await changePasswordAction(null, form({ currentPassword: 'Old-Pass-Word1!', newPassword: STRONG, confirm: STRONG }))
    expect(r).toEqual({ success: true })
    expect(db.verifierSignIns).toBe(1)
    expect(db.sessionSignIns).toBe(0)
  })
  it('reset link for an account with two-step verification → sent to enter the code, then back to the reset page', async () => {
    db.updateError = { message: 'AAL2 required', code: 'insufficient_aal' }
    const { redirect } = await import('next/navigation')
    await expect(resetPasswordAction(null, form({ password: STRONG, confirm: STRONG }))).rejects.toThrow('redirect')
    expect(redirect).toHaveBeenCalledWith('/mfa?next=/reset-password')
  })
})

describe('resetPasswordAction: field-level errors', () => {
  it('ties a mismatch to Confirm and rule failures to the password', async () => {
    expect((await resetPasswordAction(null, form({ password: STRONG, confirm: 'x' })))?.fieldErrors)
      .toEqual({ confirm: 'Passwords do not match.' })
    const weak = await resetPasswordAction(null, form({ password: 'short', confirm: 'short' }))
    expect(Object.keys(weak?.fieldErrors ?? {})).toEqual(['password'])
    db.reused = true
    expect((await resetPasswordAction(null, form({ password: STRONG, confirm: STRONG })))?.fieldErrors)
      .toEqual({ password: 'You cannot reuse one of your last 5 passwords. Please choose a different one.' })
  })
})

describe('changePasswordAction: field-level errors', () => {
  it('ties each error to the field to fix', async () => {
    expect((await changePasswordAction(null, form({ currentPassword: 'Old1!pass', newPassword: STRONG, confirm: 'x' })))?.fieldErrors)
      .toEqual({ confirm: 'New passwords do not match.' })
    expect((await changePasswordAction(null, form({ currentPassword: STRONG, newPassword: STRONG, confirm: STRONG })))?.fieldErrors)
      .toEqual({ newPassword: 'New password must be different from your current password.' })
    db.reused = true
    expect((await changePasswordAction(null, form({ currentPassword: 'Old1!pass', newPassword: STRONG, confirm: STRONG })))?.fieldErrors)
      .toEqual({ newPassword: 'You cannot reuse one of your last 5 passwords. Please choose a different one.' })
    db.reused = false
    db.signInError = { message: 'Invalid login credentials' }
    expect(Object.keys((await changePasswordAction(null, form({ currentPassword: 'wrong', newPassword: STRONG, confirm: STRONG })))?.fieldErrors ?? {}))
      .toEqual(['currentPassword'])
  })
})

describe('requestEmailChangeAction: field-level errors', () => {
  it('ties required, format and same-address errors to their field', async () => {
    expect((await requestEmailChangeAction(null, form({ newEmail: '', currentPassword: 'x' })))?.fieldErrors)
      .toEqual({ newEmail: 'New email is required.' })
    expect((await requestEmailChangeAction(null, form({ newEmail: 'nope', currentPassword: 'x' })))?.fieldErrors)
      .toEqual({ newEmail: 'Please enter a valid email address.' })
    expect((await requestEmailChangeAction(null, form({ newEmail: 'new@example.com', currentPassword: '' })))?.fieldErrors)
      .toEqual({ currentPassword: 'Current password is required.' })
    expect((await requestEmailChangeAction(null, form({ newEmail: 'Admin@example.com', currentPassword: 'x' })))?.fieldErrors)
      .toEqual({ newEmail: 'That is already your sign-in email.' })
  })
})
