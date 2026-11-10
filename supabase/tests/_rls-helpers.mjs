// Shared setup for the database-rule (RLS) test scripts in this folder.
// Not part of `npm test`: there is no local database, so these run against
// the Supabase project in .env.local, as real signed-in test users calling
// Supabase directly (the same requests a modified browser or app could send,
// with no app code in the way). Each script creates throwaway "ZZ RLS" data
// and always deletes it again.
import { createRequire } from 'module'
import fs from 'fs'
import crypto from 'crypto'

const require = createRequire(`${process.cwd()}/package.json`)
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL

export const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
/** A fresh client holding only the public (anon) key — signed out until you sign in. */
export const newAnonClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// The audit log is permanent (decision 6), so a throwaway test user it refers
// to can't be deleted: they're deactivated and blocked from signing in instead,
// and given a unique "retired" email so scripts with fixed test emails can run
// again. (Phones stay: Gatekeepers must have one, so scripts pick random numbers.)
export async function retireUsers(ids) {
  let deleted = 0, retired = 0
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (!error) { deleted++; continue }
    const email = `zz-retired-${id}@example.com`
    await admin.from('profiles').update({ is_active: false, deactivation_reason: 'manual', email }).eq('id', id)
    await admin.auth.admin.updateUserById(id, { ban_duration: '876000h', email, email_confirm: true })
    retired++
  }
  return { deleted, retired }
}

/** Deletes test clubs; any still referenced by a retired user is deactivated and renamed instead. */
export async function retireClubs(ids) {
  for (const id of ids) {
    const { error } = await admin.from('clubs').delete().eq('id', id)
    if (error) await admin.from('clubs').update({ is_active: false, name: `ZZ RLS retired ${id}`, club_code: `ZZR-${id}` }).eq('id', id)
  }
}

export function rlsSuite(prefix) {
  let pass = 0, fail = 0
  const created = { users: [], clubs: [], cleanups: [] }
  const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`) }

  async function mkClub(name) {
    const tag = crypto.randomBytes(3).toString('hex')
    const { data, error } = await admin.from('clubs').insert({ name: `ZZ RLS ${prefix} ${name} ${tag}`, club_code: `ZZ-${tag}`, location: 'Test', is_active: true }).select('id').single()
    if (error) throw error
    created.clubs.push(data.id)
    return data.id
  }

  let phone = Math.floor(Math.random() * 9000)
  async function mkUser(tag, role, clubId) {
    const email = `zz-rls-${prefix}-${tag}-${crypto.randomBytes(3).toString('hex')}@example.com`
    const password = 'Zz!' + crypto.randomBytes(9).toString('base64url') + '9a'
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    created.users.push(data.user.id)
    const { error: pErr } = await admin.from('profiles').insert({
      id: data.user.id, full_name: `ZZ RLS ${tag}`, email, role, club_id: clubId, is_active: true,
      must_change_password: false, phone: `+9477${String(800000 + (phone++ % 199999)).padStart(7, '0')}`,
    })
    if (pErr) throw pErr
    const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error: sErr } = await client.auth.signInWithPassword({ email, password })
    if (sErr) throw sErr
    return { id: data.user.id, db: client }
  }

  /** Register extra cleanup (runs before users/clubs are deleted). */
  const onCleanup = fn => created.cleanups.push(fn)

  async function cleanup() {
    for (const fn of created.cleanups.reverse()) { try { await fn() } catch (e) { console.log('cleanup step failed:', e.message) } }
    const users = [...created.users]
    let r = { deleted: 0, retired: 0 }
    if (users.length) {
      await admin.from('password_history').delete().in('user_id', users)
      r = await retireUsers(users)
    }
    await retireClubs(created.clubs)
    console.log(`cleanup: ${r.deleted} users deleted, ${r.retired} retired (in the audit log), ${created.clubs.length} clubs`)
  }

  async function run(main) {
    try { await main() } catch (err) { fail++; console.log('ERROR', err.message ?? err) } finally {
      await cleanup()
      console.log(`\n${pass} passed, ${fail} failed`)
      process.exitCode = fail ? 1 : 0
    }
  }

  return { check, mkClub, mkUser, onCleanup, run }
}
