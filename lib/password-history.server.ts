import 'server-only'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/admin'

// Password reuse prevention (last 5). Review Finding 13f: people have no
// access to their own password history any more (the database refuses every
// client), so only this server code reads and writes it, with the service
// role. Callers pass the user id from the server-side session
// (supabase.auth.getUser()), never one from the form.

const HISTORY_LIMIT = 5
const SALT_ROUNDS = 10

export async function isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('password_history')
    .select('password_hash')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  // Fail closed: if the history can't be read, don't let the change through.
  if (error) {
    console.error('[isPasswordReused] history read failed', { code: error.code ?? null })
    throw new Error('Password history unavailable')
  }
  if (!data?.length) return false

  for (const { password_hash } of data) {
    if (await bcrypt.compare(newPassword, password_hash)) return true
  }
  return false
}

export async function recordPasswordHash(userId: string, password: string): Promise<void> {
  const admin = createAdminClient()
  const hash = await bcrypt.hash(password, SALT_ROUNDS)

  const { error } = await admin.from('password_history').insert({ user_id: userId, password_hash: hash })
  if (error) console.error('[recordPasswordHash] insert failed', { code: error.code ?? null })

  // Prune to keep only last HISTORY_LIMIT entries
  const { data: all } = await admin
    .from('password_history')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (all && all.length > HISTORY_LIMIT) {
    const stale = all.slice(HISTORY_LIMIT).map(r => r.id)
    await admin.from('password_history').delete().in('id', stale)
  }
}

// Account-creation time only: there's no user session yet to run the
// regular per-request client under, so this uses the admin client directly.
// Seeding the generated temp password here means the reuse check already
// correctly rejects a user "changing" their password to the exact same
// temp value they were emailed — no separate history-pruning logic needed
// since this is always the first-ever row for a brand-new user.
export async function seedPasswordHistoryAdmin(userId: string, password: string): Promise<void> {
  const admin = createAdminClient()
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  await admin.from('password_history').insert({ user_id: userId, password_hash: hash })
}
