import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Review Finding 2: set-password links. No password is ever chosen by, shown
// to or emailed by anyone but the account holder; links are single use,
// expire after 72 hours, and only the token's hash is stored.

const USER = '00000000-0000-4000-8000-000000000005'
const CHAMPION = '00000000-0000-4000-8000-000000000003'
const GOOD = 'Kandy-Lake-River-42!'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, emails: [] as Record<string, unknown>[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/password-history.server', () => ({ seedPasswordHistoryAdmin: vi.fn() }))
vi.mock('@/lib/send-email', () => ({
  sendAccountSetupEmail: vi.fn(async (p: Record<string, unknown>) => { h.emails.push({ kind: 'plain', ...p }); return {} }),
  // Gatekeepers get the branded welcome email (Review Finding 3).
  sendGatekeeperWelcomeEmail: vi.fn(async (p: Record<string, unknown>) => { h.emails.push({ kind: 'gatekeeper', setupUrl: p.setPasswordLink, ...p }); return {} }),
}))

import {
  ACCOUNT_SETUP_TTL_HOURS, completeAccountSetup, hasSignedIn, hashSetupToken, issueAccountSetupInvite, peekAccountSetupInvite,
} from '@/lib/account-setup.server'
import { writeAuditLog } from '@/lib/audit'
import { seedPasswordHistoryAdmin } from '@/lib/password-history.server'
import { sendAccountSetupEmail, sendGatekeeperWelcomeEmail } from '@/lib/send-email'

const invites = () => h.db.tables.account_setup_invites ?? []
const passwordWrites = () => h.db.writes.filter(w => w.table === 'auth.users' && 'password' in w.values)
const tokenFromEmail = () => new URL(String(h.emails.at(-1)!.setupUrl)).searchParams.get('token')!

beforeEach(() => {
  h.emails = []
  vi.mocked(writeAuditLog).mockClear()
  vi.mocked(seedPasswordHistoryAdmin).mockClear()
  vi.mocked(sendAccountSetupEmail).mockClear()
  vi.mocked(sendGatekeeperWelcomeEmail).mockClear()
  h.db = createFakeDb({
    profiles: [
      { id: USER, full_name: 'Asha Perera', email: 'asha@example.com', role: 'gatekeeper', club_id: 'club-a', is_active: true },
      { id: CHAMPION, full_name: 'Nimal Silva', email: 'nimal@example.com', role: 'champion', club_id: 'club-a', is_active: true },
      { id: 'sa', full_name: 'Super Admin', email: 'sa@example.com', role: 'super_admin', club_id: null, is_active: true },
      { id: 'ch-other', full_name: 'Club Champion', email: 'c@example.com', role: 'champion', club_id: 'club-b', is_active: true },
    ],
    clubs: [{ id: 'club-a', name: 'Kandy Lions' }, { id: 'club-b', name: 'Galle' }],
    'auth.users': [{ id: USER, email: 'asha@example.com' }],
    account_setup_invites: [],
  }, {
    account_has_signed_in: () => ({ data: false, error: null }),
  })
})

describe('hasSignedIn', () => {
  it('throws when the check fails, so callers fail closed', async () => {
    h.db.rpcs.account_has_signed_in = () => ({ data: null, error: { message: 'down' } })
    await expect(hasSignedIn(USER)).rejects.toThrow()
  })
})

describe('issueAccountSetupInvite', () => {
  it('emails a link to the account’s own sign-in address, storing only the token’s hash', async () => {
    expect(await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION, siteUrl: 'https://hmm.test' })).toEqual({ ok: true })
    const email = h.emails[0]
    expect(email.to).toBe('asha@example.com')
    expect(String(email.setupUrl)).toMatch(/^https:\/\/hmm\.test\/auth\/set-up-account\?token=/)
    expect(email.expiresInHours).toBe(ACCOUNT_SETUP_TTL_HOURS)
    const token = tokenFromEmail()
    expect(invites()).toHaveLength(1)
    expect(invites()[0].token_hash).toBe(hashSetupToken(token))
    expect(JSON.stringify(h.db.tables)).not.toContain(token)
    expect(invites()[0].requested_by).toBe(CHAMPION)
  })
  it('the link expires after 72 hours', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    const hours = (new Date(String(invites()[0].expires_at)).getTime() - Date.now()) / 3600_000
    expect(hours).toBeGreaterThan(71.9)
    expect(hours).toBeLessThanOrEqual(72)
  })
  it('never puts a password in the email; any temporary password is replaced by one nobody is told', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    expect(Object.keys(h.emails[0])).not.toContain('tempPassword')
    expect(JSON.stringify(h.emails[0])).not.toMatch(/password=/i)
    const [write] = passwordWrites()
    expect(String(write.values.password).length).toBeGreaterThanOrEqual(48)
    expect(JSON.stringify(h.emails[0])).not.toContain(String(write.values.password))
  })
  it('earlier unused links are cancelled', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    expect(invites()[0].cancelled_at).toBeTruthy()
    expect(invites()[1].cancelled_at).toBeUndefined()
  })
  it('refused by the database rule (signed in since, or requester not allowed) → nothing sent, no password changed', async () => {
    h.db.writeErrors.account_setup_invites = { code: '42501', message: 'refused' }
    const r = await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    expect(r).toEqual({ error: expect.stringMatching(/already been signed into/) })
    expect(h.emails).toEqual([])
    expect(passwordWrites()).toEqual([])
  })
  it('audits who sent it, without the email address or token', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorId: CHAMPION, action: 'account.setup_link_sent', entityId: USER }))
    const details = JSON.stringify(vi.mocked(writeAuditLog).mock.calls[0][0].details)
    expect(details).not.toContain('asha@example.com')
    expect(details).not.toContain(tokenFromEmail())
  })
})

describe('completeAccountSetup', () => {
  async function linkToken() {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    h.db.writes = []
    return tokenFromEmail()
  }

  it('sets the password the person chose, once, and records it in their password history', async () => {
    const token = await linkToken()
    expect(await peekAccountSetupInvite(token)).toEqual({ email: 'asha@example.com' })
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ done: true, role: 'gatekeeper' })
    expect(passwordWrites()).toEqual([expect.objectContaining({ values: expect.objectContaining({ id: USER, password: GOOD }) })])
    expect(seedPasswordHistoryAdmin).toHaveBeenCalledWith(USER, GOOD)
    expect(writeAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: USER, action: 'account.password_set_from_invite' }))
    // Single use.
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ invalid: true })
    expect(await peekAccountSetupInvite(token)).toBeNull()
  })
  it('an expired link → invalid, nothing changed', async () => {
    const token = await linkToken()
    invites()[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ invalid: true })
    expect(passwordWrites()).toEqual([])
  })
  it('a replaced (cancelled) link → invalid', async () => {
    const token = await linkToken()
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    h.db.writes = []
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ invalid: true })
    expect(passwordWrites()).toEqual([])
  })
  it('a deactivated account → invalid', async () => {
    const token = await linkToken()
    h.db.tables.profiles[0].is_active = false
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ invalid: true })
  })
  it('a guessed or garbage token → invalid', async () => {
    await linkToken()
    expect(await completeAccountSetup('nope', GOOD, GOOD)).toEqual({ invalid: true })
    expect(await completeAccountSetup('x'.repeat(500), GOOD, GOOD)).toEqual({ invalid: true })
  })
  it('passwords that don’t match, or break the rules → field error, link still usable', async () => {
    const token = await linkToken()
    expect(await completeAccountSetup(token, GOOD, 'other')).toMatchObject({ fieldErrors: { confirm: expect.any(String) } })
    expect(await completeAccountSetup(token, 'short', 'short')).toMatchObject({ fieldErrors: { password: expect.any(String) } })
    expect(await completeAccountSetup(token, 'AshaPerera-2026!', 'AshaPerera-2026!')).toMatchObject({ fieldErrors: { password: expect.stringMatching(/name/) } })
    expect(passwordWrites()).toEqual([])
    expect(await completeAccountSetup(token, GOOD, GOOD)).toMatchObject({ done: true })
  })
  it('refused by the database at claim time (account signed in since) → invalid, no password set', async () => {
    const token = await linkToken()
    h.db.writeErrors.account_setup_invites = { code: '42501', message: 'refused' }
    expect(await completeAccountSetup(token, GOOD, GOOD)).toEqual({ invalid: true })
    expect(passwordWrites()).toEqual([])
  })
})

describe('issueAccountSetupInvite — which email (Review Finding 3)', () => {
  it('Gatekeeper: branded welcome email naming the Champion who sent it and the club', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: CHAMPION })
    expect(h.emails[0]).toMatchObject({ kind: 'gatekeeper', to: 'asha@example.com', gatekeeperFirstName: 'Asha', championName: 'Nimal Silva', clubName: 'Kandy Lions', expiresInHours: 72 })
  })
  it('Gatekeeper, sent by a Super Admin: names the club’s active Champion', async () => {
    await issueAccountSetupInvite({ userId: USER, requestedBy: 'sa' })
    expect(h.emails[0]).toMatchObject({ championName: 'Nimal Silva' })
  })
  it('Champion account: the plain set-password email', async () => {
    h.db.tables['auth.users'].push({ id: 'ch-other', email: 'c@example.com' })
    await issueAccountSetupInvite({ userId: 'ch-other', requestedBy: 'sa' })
    expect(h.emails[0]).toMatchObject({ kind: 'plain', to: 'c@example.com' })
  })
})
