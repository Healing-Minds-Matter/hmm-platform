import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'

// Review Finding 13f: password history is read and written only by trusted
// server code (service role), never through the signed-in user's session.

const s = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; password_hash: string; created_at: string }[],
  readError: null as { code: string } | null,
  userClientUsed: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { s.userClientUsed++; return {} } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe('password_history')
      const sorted = (userId: string) => s.rows.filter(r => r.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return {
        select: (cols: string) => ({
          eq: (_c: string, userId: string) => ({
            order: () => {
              const all = { data: sorted(userId).map(r => (cols === 'id' ? { id: r.id } : { password_hash: r.password_hash })), error: null }
              return Object.assign(Promise.resolve(s.readError ? { data: null, error: s.readError } : all), {
                limit: async (n: number) => (s.readError ? { data: null, error: s.readError } : { data: all.data.slice(0, n), error: null }),
              })
            },
          }),
        }),
        insert: async (row: { user_id: string; password_hash: string }) => {
          s.rows.push({ id: `r${s.rows.length + 1}`, created_at: new Date(Date.now() + s.rows.length).toISOString(), ...row })
          return { error: null }
        },
        delete: () => ({ in: async (_c: string, ids: string[]) => { s.rows = s.rows.filter(r => !ids.includes(r.id)); return { error: null } } }),
      }
    },
  }),
}))

import { isPasswordReused, recordPasswordHash } from '@/lib/password-history.server'

beforeEach(() => { s.rows = []; s.readError = null; s.userClientUsed = 0 })

describe('password history (server only)', () => {
  it('records, detects reuse of the last 5, and keeps only 5', async () => {
    for (let i = 1; i <= 6; i++) await recordPasswordHash('u1', `Password-${i}!`)
    expect(s.rows).toHaveLength(5)
    expect(await isPasswordReused('u1', 'Password-6!')).toBe(true)
    expect(await isPasswordReused('u1', 'Password-2!')).toBe(true)
    expect(await isPasswordReused('u1', 'Password-1!')).toBe(false) // pruned (6th back)
    expect(await isPasswordReused('u2', 'Password-6!')).toBe(false) // someone else's history isn't used
    expect(await bcrypt.compare('Password-6!', s.rows.at(-1)!.password_hash)).toBe(true)
  })

  it('never uses the signed-in user’s own session', async () => {
    await recordPasswordHash('u1', 'Password-1!')
    await isPasswordReused('u1', 'x')
    expect(s.userClientUsed).toBe(0)
  })

  it('if the history can’t be read, it fails closed (throws) instead of saying "not reused"', async () => {
    s.readError = { code: '42501' }
    await expect(isPasswordReused('u1', 'x')).rejects.toThrow()
  })
})
