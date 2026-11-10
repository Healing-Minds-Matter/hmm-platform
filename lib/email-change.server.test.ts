import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Security Finding 3: someone else's sign-in email only changes once the new
// address confirms a one-time, expiring link.

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, mails: [] as { kind: string; to: string; url?: string }[] }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/send-email', () => ({
  sendEmailChangeConfirmation: vi.fn(async (p: { to: string; confirmUrl: string }) => { h.mails.push({ kind: 'confirm', to: p.to, url: p.confirmUrl }); return {} }),
  sendEmailChangeNotice: vi.fn(async (p: { to: string }) => { h.mails.push({ kind: 'notice', to: p.to }); return {} }),
}))

import { confirmAccountEmailChange, hashEmailChangeToken, requestAccountEmailChange } from '@/lib/email-change.server'

const request = () => requestAccountEmailChange({
  userId: 'gk', currentEmail: 'old@example.com', newEmail: 'New@Example.com', fullName: 'Asha', requestedBy: 'champ', siteUrl: 'https://hmm.test',
})
const tokenFromMail = () => new URL(h.mails.filter(m => m.kind === 'confirm').at(-1)!.url!).searchParams.get('token')!
const authWrites = () => h.db.writes.filter(w => w.table === 'auth.users')

beforeEach(() => {
  h.mails = []
  h.db = createFakeDb({
    profiles: [{ id: 'gk', email: 'old@example.com' }, { id: 'other', email: 'taken@example.com' }],
    email_change_requests: [],
  })
})

describe('requestAccountEmailChange', () => {
  it('stores only a hash, emails the link to the NEW address and a notice to the current one, changes nothing yet', async () => {
    expect(await request()).toEqual({ ok: true })
    const token = tokenFromMail()
    const [req] = h.db.tables.email_change_requests
    expect(req.new_email).toBe('new@example.com')
    expect(req.token_hash).toBe(hashEmailChangeToken(token))
    expect(JSON.stringify(req)).not.toContain(token)
    expect(h.mails.map(m => [m.kind, m.to])).toEqual([['confirm', 'new@example.com'], ['notice', 'old@example.com']])
    expect(authWrites()).toEqual([])
    expect(h.db.tables.profiles[0].email).toBe('old@example.com')
  })

  it('refuses an address that belongs to another account', async () => {
    const r = await requestAccountEmailChange({ userId: 'gk', currentEmail: 'old@example.com', newEmail: 'taken@example.com', fullName: 'A', requestedBy: 'sa' })
    expect(r).toMatchObject({ field: 'email' })
    expect(h.mails).toEqual([])
  })

  it('a newer request replaces the older one', async () => {
    await request(); const first = tokenFromMail()
    await request()
    expect(await confirmAccountEmailChange(first)).toBe('invalid')
  })
})

describe('confirmAccountEmailChange', () => {
  it('valid link → sign-in email and profile change', async () => {
    await request()
    expect(await confirmAccountEmailChange(tokenFromMail())).toBe('done')
    expect(authWrites()[0].values).toMatchObject({ id: 'gk', email: 'new@example.com' })
    expect(h.db.tables.profiles[0].email).toBe('new@example.com')
  })

  it('works only once', async () => {
    await request(); const token = tokenFromMail()
    expect(await confirmAccountEmailChange(token)).toBe('done')
    expect(await confirmAccountEmailChange(token)).toBe('invalid')
    expect(authWrites()).toHaveLength(1)
  })

  it('expired link → nothing changes', async () => {
    await request()
    h.db.tables.email_change_requests[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await confirmAccountEmailChange(tokenFromMail())).toBe('invalid')
    expect(authWrites()).toEqual([])
  })

  it('made-up or empty token → invalid', async () => {
    expect(await confirmAccountEmailChange('nope')).toBe('invalid')
    expect(await confirmAccountEmailChange('')).toBe('invalid')
  })

  it('address taken by someone else in the meantime → not applied', async () => {
    await request()
    h.db.tables.profiles.push({ id: 'late', email: 'new@example.com' })
    expect(await confirmAccountEmailChange(tokenFromMail())).toBe('taken')
    expect(authWrites()).toEqual([])
  })
})
