// Database-rule (RLS) tests for announcements with several clubs or all
// clubs — migration 20261031000000. Not part of `npm test`: there is no
// local database, so this runs against the Supabase project in .env.local,
// as real signed-in test users calling Supabase directly (no app code).
// It creates throwaway "ZZ RLS" clubs, users and announcements, prints
// PASS/FAIL per check, and always deletes everything it created.
//
//   node supabase/tests/announcement-clubs-rls.mjs     (from the project root)
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

const PREFIX = 'zz-rls-ann-'
const created = { users: [], clubs: [] }

async function mkClub(name) {
  const { data, error } = await admin.from('clubs').insert({ name: `ZZ RLS ${name}`, club_code: `ZZRA-${name}`, location: 'Test', is_active: true }).select('id').single()
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
    must_change_password: false, phone: `+9477919${String(phone++).padStart(4, '0')}`,
  })
  if (pErr) throw pErr
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  return { id: data.user.id, db: client }
}

const yesterday = new Date(Date.now() - 864e5).toISOString()
const save = (who, title, audience, allClubs, clubIds, { id = null, status = 'published' } = {}) =>
  who.db.rpc('save_announcement', {
    p_announcement_id: id, p_title: `ZZ RLS ${title}`, p_body: 'Test', p_publish_date: yesterday, p_expiry_date: null,
    p_priority: 'standard', p_audience: audience, p_status: status, p_is_pinned: false,
    p_is_all_clubs: allClubs, p_club_ids: clubIds,
  })
const linksOf = async (id) => (await admin.from('announcement_clubs').select('club_id').eq('announcement_id', id)).data.map(l => l.club_id).sort()
const sees = async (who, id) => !!(await who.db.from('announcements').select('id').eq('id', id).maybeSingle()).data
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

async function main() {
  const A = await mkClub('A'), B = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const chA = await mkUser('champ-a', 'champion', A)
  const chB = await mkUser('champ-b', 'champion', B)
  const gkA = await mkUser('gk-a', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)

  // ── Super Admin ──
  const r1 = await save(sa, 'SA A+B', 'specific_clubs', false, [A, B])
  check('SA posts to several clubs', !r1.error && same(await linksOf(r1.data), [A, B]), r1.error?.message)
  const aMulti = r1.data
  const r2 = await save(sa, 'SA all clubs', 'specific_clubs', true, [])
  const { data: r2row } = await admin.from('announcements').select('is_all_clubs').eq('id', r2.data ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  check('SA posts to all clubs', !r2.error && r2row?.is_all_clubs === true && (await linksOf(r2.data)).length === 0, r2.error?.message)
  const aAllClubs = r2.data
  check('SA Specific Cohort with no clubs is refused', !!(await save(sa, 'SA none', 'specific_clubs', false, [])).error)
  const r4 = await save(sa, 'SA everyone', 'all', false, [A])
  check('SA "All Users" saves no clubs', !r4.error && (await linksOf(r4.data)).length === 0, r4.error?.message)
  const aEveryone = r4.data
  const aBOnly = (await save(sa, 'SA B only', 'specific_clubs', false, [B])).data
  const aADraft = (await save(sa, 'SA A draft', 'specific_clubs', false, [A], { status: 'draft' })).data
  const r7 = await save(sa, 'SA A+B to A', 'specific_clubs', false, [A], { id: aMulti })
  check('SA edits clubs (A+B to A)', !r7.error && same(await linksOf(aMulti), [A]), r7.error?.message)
  const r8 = await save(sa, 'SA A+B', 'specific_clubs', false, [A, B], { id: aMulti })
  check('SA edits clubs back (A to A+B)', !r8.error && same(await linksOf(aMulti), [A, B]), r8.error?.message)

  // ── Champion ──
  const c1 = await save(chA, 'Champ own', 'specific_clubs', false, [A])
  check('Champion posts to their own club', !c1.error && same(await linksOf(c1.data), [A]), c1.error?.message)
  const aChamp = c1.data
  check('Champion: another club is refused', !!(await save(chA, 'x', 'specific_clubs', false, [B])).error)
  check('Champion: several clubs are refused', !!(await save(chA, 'x', 'specific_clubs', false, [A, B])).error)
  check('Champion: all clubs is refused', !!(await save(chA, 'x', 'specific_clubs', true, [])).error)
  check('Champion: "All Users" is refused', !!(await save(chA, 'x', 'all', false, [])).error)
  const raw = await chA.db.from('announcements').insert({ title: 'ZZ RLS raw', body: 'x', publish_date: yesterday, created_by: chA.id, club_id: B })
  check('Champion: direct insert for another club is refused', !!raw.error)
  const link = await chA.db.from('announcement_clubs').insert({ announcement_id: aChamp, club_id: B })
  check('Champion: direct link of another club is refused', !!link.error)
  const link2 = await chA.db.from('announcement_clubs').insert({ announcement_id: aBOnly, club_id: A })
  check('Champion: linking their club to a Super Admin announcement is refused', !!link2.error)
  const flip = await chA.db.from('announcements').update({ is_all_clubs: true }).eq('id', aChamp).select()
  check('Champion: turning own post into "all clubs" is refused', !!flip.error || (flip.data ?? []).length === 0)
  const upd = await chA.db.from('announcements').update({ title: 'hacked' }).eq('id', aMulti).select()
  check("Champion can't edit a Super Admin announcement", (upd.data ?? []).length === 0)

  // ── Visibility ──
  check('Gatekeeper A sees an A+B announcement', await sees(gkA, aMulti))
  check('Gatekeeper B sees an A+B announcement', await sees(gkB, aMulti))
  check('Gatekeeper A sees an all-clubs announcement', await sees(gkA, aAllClubs))
  check('Gatekeeper B sees an all-clubs announcement', await sees(gkB, aAllClubs))
  check('Gatekeeper A sees an "All Users" announcement', await sees(gkA, aEveryone))
  check('Gatekeeper A does NOT see a B-only announcement', !(await sees(gkA, aBOnly)))
  check('Champion A does NOT see a B-only announcement', !(await sees(chA, aBOnly)))
  check('Champion B sees a B-only announcement', await sees(chB, aBOnly))
  check('Gatekeeper A does NOT see a draft for club A', !(await sees(gkA, aADraft)))
  check('Champion A still sees a draft for club A (to manage)', await sees(chA, aADraft))
  check("Gatekeeper A sees their Champion's post", await sees(gkA, aChamp))
  check("Gatekeeper B does NOT see club A's Champion post", !(await sees(gkB, aChamp)))
  const hidden = await gkA.db.from('announcement_clubs').select('club_id').eq('announcement_id', aBOnly)
  check("Gatekeeper A can't read the clubs of a B-only announcement", (hidden.data ?? []).length === 0)
  const labels = await gkA.db.rpc('announcement_source_labels', { p_announcement_ids: [aChamp, aBOnly] })
  const labelOk = !labels.error && labels.data.length === 1 && labels.data[0].source_label === 'ZZ RLS A CHAMPION'
  check("Source label shows the Champion's club, and nothing for hidden posts", labelOk, labels.error?.message ?? JSON.stringify(labels.data))

  // ── Migration / old-style saves ──
  const { data: legacy, error: lErr } = await admin.from('announcements').insert({ title: 'ZZ RLS legacy', body: 'x', publish_date: yesterday, created_by: sa.id, audience: 'specific_clubs', club_id: A }).select('id').single()
  check('Old-style single-club save is linked to its club', !lErr && same(await linksOf(legacy.id), [A]), lErr?.message)
  check('Old-style single-club announcement shows for its club', await sees(gkA, legacy.id))
  check('Old-style single-club announcement is hidden from other clubs', !(await sees(gkB, legacy.id)))
  const { data: existing } = await admin.from('announcements').select('id, club_id, is_all_clubs, announcement_clubs(club_id)').not('title', 'ilike', 'ZZ RLS%')
  const broken = existing.filter(a => a.is_all_clubs || (a.club_id
    ? a.announcement_clubs.length !== 1 || a.announcement_clubs[0].club_id !== a.club_id
    : a.announcement_clubs.length !== 0))
  check(`All ${existing.length} existing announcements kept their club (or none)`, broken.length === 0, `${broken.length} changed`)
}

async function cleanup() {
  const { data: rows } = await admin.from('announcements').select('id').ilike('title', 'ZZ RLS%')
  const ids = (rows ?? []).map(r => r.id)
  const users = [...created.users]
  if (ids.length) { await admin.from('audit_logs').delete().in('entity_id', ids); await admin.from('announcements').delete().in('id', ids) }
  if (users.length) {
    await admin.from('audit_logs').delete().in('actor_id', users)
    await admin.from('password_history').delete().in('user_id', users)
    for (const id of users) await admin.auth.admin.deleteUser(id)
    await admin.from('profiles').delete().in('id', users)
  }
  if (created.clubs.length) await admin.from('clubs').delete().in('id', created.clubs)
  const { count: u } = await admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', `${PREFIX}%`)
  const { count: c } = await admin.from('clubs').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ RLS %')
  const { count: a } = await admin.from('announcements').select('id', { count: 'exact', head: true }).ilike('title', 'ZZ RLS%')
  console.log(`cleanup: deleted ${ids.length} announcements, ${users.length} users, ${created.clubs.length} clubs; left: users ${u}, clubs ${c}, announcements ${a}`)
}

try { await main() } catch (err) { fail++; console.log('ERROR', err.message ?? err) } finally {
  await cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
}
