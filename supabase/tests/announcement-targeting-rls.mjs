// Database-rule tests for announcement targeting, schedule and Champion
// permissions (sheet rows 38, 61, 71, 72) — migration 20261110000001.
// Run after the migration is applied:
//
//   node supabase/tests/announcement-targeting-rls.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('ann')

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString()
const ago = mins => new Date(Date.now() - mins * 60e3).toISOString()

await run(async () => {
  const A = await mkClub('A'), B = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const chA = await mkUser('champ-a', 'champion', A)
  const gkA1 = await mkUser('gk-a1', 'gatekeeper', A)
  const gkA2 = await mkUser('gk-a2', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)
  const ids = []
  onCleanup(async () => {
    if (ids.length) {
      await admin.from('audit_logs').delete().in('entity_id', ids)
      await admin.from('announcements').delete().in('id', ids)
    }
    await admin.from('role_overrides').delete().eq('user_id', chA.id)
  })

  const save = (who, extra = {}) => who.db.rpc('save_announcement', {
    p_announcement_id: null, p_title: 'ZZ RLS ann', p_body: 'x', p_publish_date: ago(1), p_expiry_date: null,
    p_priority: 'standard', p_audience: 'specific_clubs', p_status: 'published', p_is_pinned: false,
    p_is_all_clubs: false, p_club_ids: [A], p_recipient_ids: [], ...extra,
  }).then(r => { if (r.data) ids.push(r.data); return r })
  const sees = async (who, id) => !!(await who.db.from('announcements').select('id').eq('id', id).maybeSingle()).data
  const count = (who, args) => who.db.rpc('announcement_recipient_count', {
    p_audience: 'specific_clubs', p_is_all_clubs: false, p_club_ids: [A], p_recipient_ids: [], ...args,
  })

  // ── Row 38: people inside the clubs, counted once ──
  const people = await save(sa, { p_club_ids: [A, B], p_recipient_ids: [gkA1.id, gkA1.id, gkB.id] })
  check('SA picks people inside the chosen clubs', !people.error, people.error?.message)
  const { data: rows } = await admin.from('announcement_recipients').select('user_id').eq('announcement_id', people.data)
  check('each person is stored once', rows?.length === 2, JSON.stringify(rows))
  check('picked Gatekeeper A1 sees it', await sees(gkA1, people.data))
  check('picked Gatekeeper B sees it', await sees(gkB, people.data))
  check('NOT picked Gatekeeper A2 does not see it', !(await sees(gkA2, people.data)))
  const outsider = await save(sa, { p_club_ids: [A], p_recipient_ids: [gkB.id] })
  check('a person outside the chosen clubs is refused', !!outsider.error, 'saved')
  const whole = await save(sa, { p_club_ids: [A] })
  check('no people picked = everyone in the club sees it', await sees(gkA2, whole.data) && !(await sees(gkB, whole.data)))

  const c1 = await count(sa, { p_club_ids: [A, B] })
  check('count: everyone in clubs A and B (each once)', c1.data === 4, `${c1.data} ${c1.error?.message ?? ''}`)
  const c2 = await count(sa, { p_club_ids: [A, B], p_recipient_ids: [gkA1.id, gkA1.id, gkB.id] })
  check('count: picked people, duplicates once', c2.data === 2, `${c2.data}`)
  const c3 = await count(chA, { p_club_ids: [A, B], p_audience: 'all' })
  check('count: a Champion only ever counts their own club', c3.data === 3, `${c3.data}`)
  const c4 = await count(gkA1, {})
  check('count: a Gatekeeper may not use it', !!c4.error)

  // Audience is honoured now (was only filtered on the phone).
  const forChamps = await save(sa, { p_audience: 'champions', p_club_ids: [] })
  check('"Champions" audience reaches a Champion', await sees(chA, forChamps.data))
  check('"Champions" audience does NOT reach a Gatekeeper', !(await sees(gkA1, forChamps.data)))

  // ── Row 72: expiry after publication ──
  const badExpiry = await save(sa, { p_publish_date: inAnHour(), p_expiry_date: ago(0) })
  check('expiry before publication is refused', !!badExpiry.error && /expiry date and time/.test(badExpiry.error.message), badExpiry.error?.message)
  const rawExpiry = await sa.db.from('announcements').insert({ title: 'ZZ RLS raw', body: 'x', publish_date: inAnHour(), expiry_date: ago(5), created_by: sa.id }).select('id')
  if (rawExpiry.data?.[0]) ids.push(rawExpiry.data[0].id)
  check('direct insert with expiry before publication is refused (constraint)', !!rawExpiry.error, 'inserted')

  // ── Row 71: new publication time not in the past ──
  const past = await save(sa, { p_publish_date: ago(60) })
  check('a publication time an hour ago is refused', !!past.error && /later than now/.test(past.error.message), past.error?.message)
  const editKeep = await sa.db.rpc('save_announcement', {
    p_announcement_id: whole.data, p_title: 'ZZ RLS ann edited', p_body: 'x', p_publish_date: (await admin.from('announcements').select('publish_date').eq('id', whole.data).single()).data.publish_date,
    p_expiry_date: null, p_priority: 'standard', p_audience: 'specific_clubs', p_status: 'published', p_is_pinned: false,
    p_is_all_clubs: false, p_club_ids: [A],
  })
  check('editing keeps an unchanged (past) publication time; old callers without people still work', !editKeep.error, editKeep.error?.message)

  // ── Row 61: Champion permissions ──
  const own = await save(chA, {})
  check('Champion posts to own club (publish_club_announcements on by default)', !own.error, own.error?.message)
  const others = await chA.db.from('announcements').delete().eq('id', whole.data).select('id')
  check("Champion can't delete someone else's announcement", (others.data ?? []).length === 0)
  await admin.from('role_overrides').insert({ user_id: chA.id, permission: 'delete_announcements', is_enabled: false, updated_by: sa.id })
  const delDenied = await chA.db.from('announcements').delete().eq('id', own.data).select('id')
  check('Champion with delete_announcements denied cannot delete their own', (delDenied.data ?? []).length === 0)
  await admin.from('role_overrides').delete().eq('user_id', chA.id)
  const delAllowed = await chA.db.from('announcements').delete().eq('id', own.data).select('id')
  check('Champion deletes their own announcement (on by default)', (delAllowed.data ?? []).length === 1)
  await admin.from('role_overrides').insert({ user_id: chA.id, permission: 'publish_club_announcements', is_enabled: false, updated_by: sa.id })
  const noPublish = await save(chA, {})
  check('Champion without publish_club_announcements is refused', !!noPublish.error, 'saved')
  const rawInsert = await chA.db.from('announcements').insert({ title: 'ZZ RLS raw2', body: 'x', publish_date: inAnHour(), created_by: chA.id }).select('id')
  if (rawInsert.data?.[0]) ids.push(rawInsert.data[0].id)
  check('…also for a direct insert', !!rawInsert.error || !rawInsert.data?.length)
  await admin.from('role_overrides').delete().eq('user_id', chA.id)
  const otherClub = await save(chA, { p_club_ids: [B] })
  check('Champion: another club is refused', !!otherClub.error)
  const otherPerson = await save(chA, { p_recipient_ids: [gkB.id] })
  check('Champion: a person from another club is refused', !!otherPerson.error)
})
