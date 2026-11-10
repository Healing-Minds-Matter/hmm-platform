// Database-rule tests for the programme period and issued-type rules — migration
// 20261108000000 (Certifications manual-testing fixes, Nov 2026).
// Not part of `npm test`: there is no local database, so this runs against the Supabase project in
// .env.local, as real signed-in test users calling Supabase directly (the same requests a modified
// browser could send, with no app code in the way). It creates throwaway "ZZ PP" clubs, users and
// certification types, prints PASS/FAIL per check, and always deletes everything it created.
//
//   node supabase/tests/certification-programme-period.mjs     (from the project root)
import { createRequire } from 'module'
import fs from 'fs'
import crypto from 'crypto'
import { retireClubs, retireUsers } from './_rls-helpers.mjs'
const require = createRequire(`${process.cwd()}/package.json`)
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`) }
const errMsg = r => r.error?.message ?? ''

const PREFIX = 'zz-pp-cert-'
const created = { users: [], clubs: [], types: [] }
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)   // Sri Lanka date
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10) }

async function mkClub(name) {
  const { data, error } = await admin.from('clubs').insert({ name: `ZZ PP ${name}`, club_code: `ZZPP-${name}`, location: 'Test', is_active: true }).select('id').single()
  if (error) throw error
  created.clubs.push(data.id)
  return data.id
}
let phone = 0
async function mkUser(tag, role, clubId) {
  const email = `${PREFIX}${tag}@example.com`
  const password = 'Zz!' + crypto.randomBytes(9).toString('base64url') + '9a'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  created.users.push(data.user.id)
  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id, full_name: `ZZ PP ${tag}`, email, role, club_id: clubId, is_active: true,
    must_change_password: false, phone: `+9477938${String(phone++).padStart(4, '0')}`,
  })
  if (pErr) throw pErr
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  return { id: data.user.id, db: client }
}
async function mkType(sa, fields) {
  const r = await sa.db.from('certification_types').insert(fields).select('id').single()
  if (r.data) created.types.push(r.data.id)
  return r
}

async function main() {
  const club = await mkClub('A')
  const sa = await mkUser('sa', 'super_admin', null)
  const champ = await mkUser('champion', 'champion', club)
  const gk = await mkUser('gk', 'gatekeeper', club)
  const gk2 = await mkUser('gk2', 'gatekeeper', club)

  // ── Column, view and period validation ──
  const v = await sa.db.from('certification_type_statuses').select('offered_until, retire_on').limit(1)
  check('The view has offered_until (programme) and retire_on (retirement) columns', !v.error, errMsg(v))
  const qpr = (await admin.from('certification_types').select('offered_until').eq('code', 'QPR').single()).data
  check('Existing types got Offered until = no end date', qpr && qpr.offered_until === null)

  check('Offered until before Offered from is refused',
    /on or after Offered from/.test(errMsg(await mkType(sa, { name: 'ZZ PP Backwards', code: 'ZZPPB', offered_from: '2026-02-01', offered_until: '2026-01-31' }))))
  const same = await mkType(sa, { name: 'ZZ PP Same Day', code: 'ZZPPS', offered_from: '2026-02-01', offered_until: '2026-02-01' })
  check('Offered until equal to Offered from is accepted', !same.error, errMsg(same))

  // ── New awards must fall within the period ──
  const running = await mkType(sa, { name: 'ZZ PP Running', code: 'ZZPPR', validity_value: 1, validity_unit: 'years', offered_from: addDays(today, -60), offered_until: addDays(today, 30) })
  const R = running.data.id
  check('A date achieved before Offered from is refused',
    /only offered from/.test(errMsg(await sa.db.from('certificates').insert({ holder_id: gk.id, type_id: R, achieved_on: addDays(today, -61) }).select())))
  const inside = await sa.db.from('certificates').insert({ holder_id: gk.id, type_id: R, achieved_on: addDays(today, -10) }).select('*').single()
  check('A date achieved inside the period is accepted', !inside.error, errMsg(inside))

  const ended = await mkType(sa, { name: 'ZZ PP Ended', code: 'ZZPPE', offered_from: addDays(today, -90), offered_until: addDays(today, -30) })
  const E = ended.data.id
  check('A date achieved after Offered until is refused',
    /only offered until/.test(errMsg(await sa.db.from('certificates').insert({ holder_id: gk.id, type_id: E, achieved_on: addDays(today, -5) }).select())))
  check('Once Offered until has passed, no new award is accepted, even dated inside the period',
    /stopped being offered/.test(errMsg(await sa.db.from('certificates').insert({ holder_id: gk.id, type_id: E, achieved_on: addDays(today, -60) }).select())))
  check('A Champion is refused the same way',
    /stopped being offered/.test(errMsg(await champ.db.from('certificates').insert({ holder_id: gk2.id, type_id: E, achieved_on: addDays(today, -60) }).select())))
  const migratedOk = await admin.from('certificates').insert({ holder_id: gk2.id, type_id: E, achieved_on: addDays(today, -60), migrated: true }).select('id').single()
  check('A migrated certificate (system) isn’t checked against the period', !migratedOk.error, errMsg(migratedOk))

  // ── Editing a type that has been issued ──
  check('Offered from can’t change once issued (direct API update)',
    /Offered from can’t be changed because certificates have already been issued/.test(errMsg(await sa.db.from('certification_types').update({ offered_from: addDays(today, -70) }).eq('id', R).select())))
  check('The code can’t change once issued (direct API update)',
    /code can’t be changed because certificates have already been issued/.test(errMsg(await sa.db.from('certification_types').update({ code: 'ZZPPX' }).eq('id', R).select())))
  check('Offered until earlier than the latest date achieved is refused',
    /can’t be earlier than/.test(errMsg(await sa.db.from('certification_types').update({ offered_until: addDays(today, -11) }).eq('id', R).select())))
  const toLatest = await sa.db.from('certification_types').update({ offered_until: addDays(today, -10) }).eq('id', R).select()
  check('Offered until equal to the latest date achieved is accepted', !toLatest.error, errMsg(toLatest))

  const removedOnly = await mkType(sa, { name: 'ZZ PP Removed Only', code: 'ZZPPO', offered_from: addDays(today, -60) })
  const O = removedOnly.data.id
  const rc = await sa.db.from('certificates').insert({ holder_id: gk.id, type_id: O, achieved_on: addDays(today, -5) }).select('id').single()
  await sa.db.rpc('remove_certificate', { p_id: rc.data.id, p_category: 'Added by mistake', p_reason: 'Test removal for locking' })
  check('A removed certificate still locks Offered from',
    /Offered from can’t be changed/.test(errMsg(await sa.db.from('certification_types').update({ offered_from: addDays(today, -40) }).eq('id', O).select())))
  const unissued = await mkType(sa, { name: 'ZZ PP Unissued', code: 'ZZPPU', offered_from: addDays(today, -60) })
  const free = await sa.db.from('certification_types').update({ code: 'ZZPPU2', offered_from: addDays(today, -50) }).eq('id', unissued.data.id).select()
  check('A type with no certificates can still change its code and Offered from', !free.error, errMsg(free))

  // ── Issued certificates never change when the type changes ──
  // Back to a running period, so a renewal-free comparison is possible.
  await sa.db.from('certification_types').update({ offered_until: null }).eq('id', R)
  const before = (await admin.from('certificates').select('*').eq('id', inside.data.id).single()).data
  const beforeStatus = (await sa.db.from('certificate_statuses').select('status, expires_on').eq('id', inside.data.id).single()).data
  const edit = await sa.db.from('certification_types').update({ validity_value: 3, validity_unit: 'months', offered_until: addDays(today, 5), issuing_body: 'ZZ Test Body' }).eq('id', R).select()
  check('Validity and Offered until can still be edited once issued', !edit.error, errMsg(edit))
  const after = (await admin.from('certificates').select('*').eq('id', inside.data.id).single()).data
  const afterStatus = (await sa.db.from('certificate_statuses').select('status, expires_on').eq('id', inside.data.id).single()).data
  check('The issued certificate row is byte-for-byte unchanged (dates, validity, number, design, PDF, updated_at)', JSON.stringify(before) === JSON.stringify(after),
    `${JSON.stringify(before)} vs ${JSON.stringify(after)}`)
  check('Its status and expiry are unchanged', JSON.stringify(beforeStatus) === JSON.stringify(afterStatus))
  const fresh = await sa.db.from('certificates').insert({ holder_id: gk2.id, type_id: R, achieved_on: today }).select('validity_value, validity_unit').single()
  check('A new certificate uses the new validity', fresh.data?.validity_value === 3 && fresh.data?.validity_unit === 'months', errMsg(fresh))

  // ── Audit ──
  const { data: logs } = await sa.db.from('audit_logs').select('action, actor_id, details, created_at').eq('entity_id', R).eq('action', 'certification.type_edited').order('created_at', { ascending: false })
  const last = logs?.[0]
  const ch = last?.details?.changes ?? {}
  check('Type edits are audited with who, when and each field’s before/after',
    last?.actor_id === sa.id && !!last?.created_at && ch.validity?.from === '1 years' && ch.validity?.to === '3 months' && ch.offered_until?.from === null && ch.offered_until?.to === addDays(today, 5) && ch.issuing_body?.to === 'ZZ Test Body',
    JSON.stringify(last?.details))
  const n = logs?.length ?? 0
  await sa.db.from('certification_types').update({ name: 'ZZ PP Running' }).eq('id', R)
  const { count } = await sa.db.from('audit_logs').select('id', { count: 'exact', head: true }).eq('entity_id', R).eq('action', 'certification.type_edited')
  check('Saving with nothing changed adds no audit entry', count === n, `${n} → ${count}`)

  check('A Champion can’t edit a type', ((await champ.db.from('certification_types').update({ offered_until: today }).eq('id', R).select()).data ?? []).length === 0)
}

async function cleanup() {
  const users = [...created.users]
  if (created.types.length) {
    await admin.from('certificates').delete().in('type_id', created.types)
    await admin.from('certification_designs').delete().in('type_id', created.types)
    await admin.from('certification_type_retirements').delete().in('type_id', created.types)
    await admin.from('certificate_number_counters').delete().in('type_id', created.types)
  }
  if (users.length) {
    await admin.from('password_history').delete().in('user_id', users)
  }
  if (created.types.length) { await admin.from('certification_types').delete().in('id', created.types) }
  await retireUsers(users) // audit log is permanent: referenced users are retired
  await retireClubs(created.clubs)
  const { count: u } = await admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', `${PREFIX}%`)
  const { count: t } = await admin.from('certification_types').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ PP%')
  const { count: c } = await admin.from('clubs').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ PP %')
  console.log(`cleanup: deleted ${users.length} users, ${created.clubs.length} clubs, ${created.types.length} types; left: users ${u}, clubs ${c}, types ${t}`)
}

try { await main() } catch (err) { fail++; console.log('ERROR', err.message ?? err) } finally {
  await cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
}
