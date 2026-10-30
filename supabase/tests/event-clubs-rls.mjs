// Database-rule (RLS) tests for event clubs by role — migrations
// 20261030000000 and 20261030000001. Not part of `npm test`: there is no
// local database, so this runs against the Supabase project in .env.local,
// as real signed-in test users calling Supabase directly (no app code).
// It creates throwaway "ZZ RLS" clubs, users and events, prints PASS/FAIL
// per check, and always deletes everything it created.
//
//   node supabase/tests/event-clubs-rls.mjs     (from the project root)
import { createRequire } from 'module'
import fs from 'fs'
import crypto from 'crypto'
const require = createRequire(`${process.cwd()}/package.json`)
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`) }

const PREFIX = 'zz-rls-'
const created = { users: [], clubs: [] }

async function mkClub(name, active = true) {
  const { data, error } = await admin.from('clubs').insert({ name: `ZZ RLS ${name}`, club_code: `ZZR-${name}`, location: 'Test', is_active: active }).select('id').single()
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
    id: data.user.id, full_name: `ZZ RLS ${tag}`, email, role, club_id: clubId, is_active: true,
    must_change_password: false, phone: `+9477918${String(phone++).padStart(4, '0')}`,
  })
  if (pErr) throw pErr
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  return { id: data.user.id, db: client }
}

const fields = (title) => ({
  p_title: `ZZ RLS ${title}`, p_type: 'other', p_starts_at: new Date(Date.now() + 864e5).toISOString(), p_ends_at: null,
  p_venue: 'Test', p_description: null, p_max_participants: null, p_facilitator: 'Test', p_virtual_link: null,
})
const save = (who, title, allClubs, clubIds, eventId = null) =>
  who.db.rpc('save_event', { p_event_id: eventId, ...fields(title), p_is_all_clubs: allClubs, p_club_ids: clubIds })
const linksOf = async (eventId) => (await admin.from('event_clubs').select('club_id').eq('event_id', eventId)).data.map(l => l.club_id).sort()
const sees = async (who, eventId) => !!(await who.db.from('events').select('id').eq('id', eventId).maybeSingle()).data

async function main() {
  // ── setup ──
  const A = await mkClub('A'), B = await mkClub('B'), X = await mkClub('X', false)
  const sa = await mkUser('sa', 'super_admin', null)
  const chA = await mkUser('champ-a', 'champion', A)
  const chA2 = await mkUser('champ-a2', 'champion', A)
  const chB = await mkUser('champ-b', 'champion', B)
  const gkA = await mkUser('gk-a', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)

  // ── Super Admin ──
  const r1 = await save(sa, 'SA all', true, [])
  check('SA creates an all-clubs event', !r1.error && (await linksOf(r1.data)).length === 0, r1.error?.message)
  const eAll = r1.data
  const r2 = await save(sa, 'SA one', false, [A])
  check('SA creates a one-club event', !r2.error && JSON.stringify(await linksOf(r2.data)) === JSON.stringify([A]), r2.error?.message)
  const eAOnly = r2.data
  const r3 = await save(sa, 'SA several', false, [A, B])
  check('SA creates a several-clubs event', !r3.error && (await linksOf(r3.data)).length === 2, r3.error?.message)
  const eMulti = r3.data
  const r4 = await save(sa, 'SA B only', false, [B])
  const eBOnly = r4.data
  const r5 = await save(sa, 'SA none', false, [])
  check('SA "selected" with no clubs is refused', !!r5.error, 'saved')
  const r6 = await save(sa, 'SA inactive', false, [X])
  check('SA can\'t link an inactive club', !!r6.error, 'saved')
  const r7 = await save(sa, 'SA several→all', true, [], eMulti)
  check('SA edits several clubs → all clubs', !r7.error && (await linksOf(eMulti)).length === 0, r7.error?.message)
  const r8 = await save(sa, 'SA several', false, [A, B], eMulti)
  check('SA edits all clubs → selected clubs', !r8.error && (await linksOf(eMulti)).length === 2, r8.error?.message)
  const rawInsert = await sa.db.from('events').insert({ title: 'ZZ RLS raw', type: 'other', starts_at: new Date().toISOString(), venue: 'x', created_by: sa.id })
  check('An event with neither all clubs nor a club is refused (direct insert)', !!rawInsert.error, 'saved')

  // ── Champion ──
  const c1 = await save(chA, 'Champ own', false, [A])
  check('Champion creates an event for their own club', !c1.error && JSON.stringify(await linksOf(c1.data)) === JSON.stringify([A]), c1.error?.message)
  const eChampOwn = c1.data
  check('Champion: another club is refused', !!(await save(chA, 'Champ other', false, [B])).error)
  check('Champion: several clubs are refused', !!(await save(chA, 'Champ multi', false, [A, B])).error)
  check('Champion: all clubs is refused', !!(await save(chA, 'Champ all', true, [])).error)
  const dIns = await chA.db.from('events').insert({ title: 'ZZ RLS champ raw all', type: 'other', starts_at: new Date().toISOString(), venue: 'x', created_by: chA.id, is_all_clubs: true })
  check('Champion: direct insert of an all-clubs event is refused', !!dIns.error)
  const link = await chA.db.from('event_clubs').insert({ event_id: eChampOwn, club_id: B })
  check('Champion: direct link of another club to own event is refused', !!link.error)
  const link2 = await chA.db.from('event_clubs').insert({ event_id: eMulti, club_id: A })
  check('Champion: direct link to someone else\'s event is refused', !!link2.error)
  const unlink = await chA.db.from('event_clubs').delete().eq('event_id', eChampOwn).select()
  check('Champion: direct removal of own event\'s club does nothing', !unlink.error && (unlink.data ?? []).length === 0 && (await linksOf(eChampOwn)).length === 1)
  const c2 = await save(chA, 'Champ own edited', false, [A], eChampOwn)
  check('Champion edits their own club-only event', !c2.error, c2.error?.message)
  check('Champion: changing own event to all clubs is refused', !!(await save(chA, 'x', true, [], eChampOwn)).error)
  check('Champion: removing own event\'s club is refused', !!(await save(chA, 'x', false, [], eChampOwn)).error)
  for (const [name, id] of [['multi-club', eMulti], ['all-club', eAll], ['SA-created own-club', eAOnly], ['other club', eBOnly]]) {
    const upd = await chA.db.from('events').update({ title: 'hacked' }).eq('id', id).select()
    check(`Champion can't update a ${name} event (direct)`, !upd.error && (upd.data ?? []).length === 0, upd.error?.message ?? 'updated')
    check(`Champion can't edit a ${name} event (save_event)`, !!(await save(chA, 'hacked', false, [A], id)).error)
  }
  const c3 = await save(chA2, 'Champ A2 own', false, [A])
  const upd2 = await chA.db.from('events').update({ is_cancelled: true }).eq('id', c3.data).select()
  check('Champion can\'t cancel another Champion\'s own-club event', (upd2.data ?? []).length === 0)
  const cancel = await chA.db.from('events').update({ is_cancelled: true }).eq('id', eChampOwn).select()
  check('Champion cancels their own club-only event', !cancel.error && (cancel.data ?? []).length === 1, cancel.error?.message)
  const saCancel = await sa.db.from('events').update({ is_cancelled: true }).eq('id', c3.data).select()
  check('SA edits/cancels an event a Champion created', !saCancel.error && (saCancel.data ?? []).length === 1, saCancel.error?.message)
  const saEdit = await save(sa, 'SA edits champ event', false, [A, B], c3.data)
  check('SA changes the clubs of a Champion\'s event', !saEdit.error && (await linksOf(c3.data)).length === 2, saEdit.error?.message)

  // ── Visibility ──
  check('Gatekeeper A sees an all-clubs event', await sees(gkA, eAll))
  check('Gatekeeper B sees an all-clubs event', await sees(gkB, eAll))
  check('Gatekeeper A sees an event for club A', await sees(gkA, eAOnly))
  check('Gatekeeper A sees a several-clubs event including A', await sees(gkA, eMulti))
  check('Gatekeeper A does NOT see an event for club B only', !(await sees(gkA, eBOnly)))
  check('Gatekeeper B does NOT see an event for club A only', !(await sees(gkB, eAOnly)))
  check('Champion B does NOT see an event for club A only', !(await sees(chB, eAOnly)))
  check('Champion B sees an event for club B', await sees(chB, eBOnly))
  check('Super Admin sees every event', (await sees(sa, eBOnly)) && (await sees(sa, eAOnly)))
  const hiddenLinks = await gkA.db.from('event_clubs').select('club_id').eq('event_id', eBOnly)
  check('Gatekeeper A can\'t read the clubs of a B-only event', (hiddenLinks.data ?? []).length === 0)
  const extra = await gkA.db.rpc('event_details_extra', { p_event_id: eBOnly })
  check('Mobile details function returns nothing for a hidden event', !extra.error && (extra.data ?? []).length === 0, extra.error?.message)
  const extraAll = await gkA.db.rpc('event_details_extra', { p_event_id: eAll })
  check('Mobile details function says "All clubs" for an all-clubs event', extraAll.data?.[0]?.club_name === 'All clubs', JSON.stringify(extraAll.data))
  const reg = await gkA.db.from('event_registrations').insert({ event_id: eBOnly, gatekeeper_id: gkA.id })
  check('Gatekeeper A can\'t register for a B-only event', !!reg.error)

  // ── Migration / old-style events ──
  const { data: legacy, error: lErr } = await admin.from('events').insert({ title: 'ZZ RLS legacy', type: 'other', starts_at: new Date(Date.now() + 864e5).toISOString(), venue: 'x', club_id: A, created_by: chA.id }).select('id').single()
  check('Old-style single-club save is linked to its club', !lErr && JSON.stringify(await linksOf(legacy.id)) === JSON.stringify([A]), lErr?.message)
  check('Old-style single-club event shows for its club (Gatekeeper A)', await sees(gkA, legacy.id))
  check('Old-style single-club event is hidden from other clubs (Gatekeeper B)', !(await sees(gkB, legacy.id)))
  const { data: existing } = await admin.from('events').select('id, is_all_clubs, club_id, event_clubs(club_id)').not('title', 'ilike', 'ZZ RLS%')
  const broken = existing.filter(e => e.is_all_clubs || e.event_clubs.length !== 1 || (e.club_id && e.event_clubs[0].club_id !== e.club_id))
  check(`All ${existing.length} existing events kept exactly their one club`, broken.length === 0, `${broken.length} changed`)
}

async function cleanup() {
  const { data: evs } = await admin.from('events').select('id').ilike('title', 'ZZ RLS%')
  const evIds = (evs ?? []).map(e => e.id)
  const ids = [...created.users]
  if (evIds.length) { await admin.from('audit_logs').delete().in('entity_id', evIds); await admin.from('events').delete().in('id', evIds) }
  if (ids.length) {
    await admin.from('audit_logs').delete().in('actor_id', ids)
    await admin.from('password_history').delete().in('user_id', ids)
    for (const id of ids) await admin.auth.admin.deleteUser(id)
    await admin.from('profiles').delete().in('id', ids)
  }
  if (created.clubs.length) await admin.from('clubs').delete().in('id', created.clubs)
  const { count: u } = await admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', `${PREFIX}%`)
  const { count: c } = await admin.from('clubs').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ RLS %')
  const { count: e } = await admin.from('events').select('id', { count: 'exact', head: true }).ilike('title', 'ZZ RLS%')
  console.log(`cleanup: deleted ${evIds.length} events, ${ids.length} users, ${created.clubs.length} clubs; left: users ${u}, clubs ${c}, events ${e}`)
}

try { await main() } catch (err) { fail++; console.log('ERROR', err.message ?? err) } finally {
  await cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
}
