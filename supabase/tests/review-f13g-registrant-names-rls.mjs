// Database tests for Review Finding 13g: who sees the NAMES of people
// registered for an event. Super Admin: everyone; Champion: own club only;
// Gatekeeper: the count only (decided). Checked through every way a client
// can ask: event_details_extra(), event_registrants() and the table itself.
//
//   node supabase/tests/review-f13g-registrant-names-rls.mjs   (from the project root)
//
// Needs migration 20261116000002. LOCAL SUPABASE ONLY (refuses otherwise).
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf13g')

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const gkA = await mkUser('gkA', 'gatekeeper', A)
  const gkB = await mkUser('gkB', 'gatekeeper', B)
  const chA = await mkUser('chA', 'champion', A)
  const chB = await mkUser('chB', 'champion', B)
  const sa = await mkUser('sa', 'super_admin', null)
  const gone = await mkUser('gone', 'champion', A)

  const nameOf = async (u) => (await admin.from('profiles').select('full_name').eq('id', u.id).single()).data.full_name
  const nameA = await nameOf(gkA)
  const nameB = await nameOf(gkB)

  const { data: ev } = await admin.from('events').insert({
    title: 'zz-rf13g all clubs', type: 'workshop', starts_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    venue: 'Colombo', created_by: chA.id, is_all_clubs: true,
  }).select('id').single()
  onCleanup(async () => {
    await admin.from('event_registrations').delete().eq('event_id', ev.id)
    await admin.from('events').delete().eq('id', ev.id)
  })
  for (const gk of [gkA, gkB]) {
    const { error } = await gk.db.from('event_registrations').insert({ event_id: ev.id, gatekeeper_id: gk.id })
    check('Gatekeeper can register for the all-clubs event', !error, error?.message)
  }
  await admin.from('profiles').update({ is_active: false, deactivation_reason: 'manual' }).eq('id', gone.id)

  const extra = async (db) => {
    const { data, error } = await db.rpc('event_details_extra', { p_event_id: ev.id })
    return { row: data?.[0] ?? null, error }
  }

  // ── event_details_extra (the app's event screen) ──
  const g = await extra(gkA.db)
  check('Gatekeeper: sees the count (2)', Number(g.row?.total_registered) === 2, JSON.stringify(g))
  check('Gatekeeper: sees NO names (own or other club)', g.row && g.row.preview_names === null, JSON.stringify(g.row?.preview_names))
  const ca = await extra(chA.db)
  check('Champion A: sees only club A’s registrant', JSON.stringify(ca.row?.preview_names) === JSON.stringify([nameA]), JSON.stringify(ca.row?.preview_names))
  const cb = await extra(chB.db)
  check('Champion B: sees only club B’s registrant', JSON.stringify(cb.row?.preview_names) === JSON.stringify([nameB]), JSON.stringify(cb.row?.preview_names))
  const s = await extra(sa.db)
  check('Super Admin: sees both', (s.row?.preview_names ?? []).length === 2, JSON.stringify(s.row?.preview_names))
  const d = await extra(gone.db)
  check('deactivated user: no names', !(d.row?.preview_names?.length), JSON.stringify(d))
  const anon = await extra(newAnonClient())
  check('not signed in: can’t call it', !!anon.error)

  // ── event_registrants (the web portals) ──
  const regs = async (db) => db.rpc('event_registrants', { p_event_id: ev.id })
  check('Gatekeeper: event_registrants refused', !!(await regs(gkA.db)).error)
  const rA = await regs(chA.db)
  check('Champion A: event_registrants lists only club A', JSON.stringify((rA.data ?? []).map(r => r.full_name)) === JSON.stringify([nameA]), JSON.stringify(rA))
  const rS = await regs(sa.db)
  check('Super Admin: event_registrants lists both', (rS.data ?? []).length === 2, JSON.stringify(rS.error))

  // ── the table itself ──
  const { data: own } = await gkA.db.from('event_registrations').select('gatekeeper_id').eq('event_id', ev.id)
  check('Gatekeeper: reads only their own registration row', (own ?? []).length === 1 && own[0].gatekeeper_id === gkA.id, JSON.stringify(own))
  const { data: chRows } = await chA.db.from('event_registrations').select('gatekeeper_id').eq('event_id', ev.id)
  check('Champion A: reads only club A’s registration rows', (chRows ?? []).every(r => r.gatekeeper_id === gkA.id) && (chRows ?? []).length === 1)
  const { data: otherProfile } = await gkA.db.from('profiles').select('full_name').eq('id', gkB.id)
  check('Gatekeeper: can’t look up another person’s name', !(otherProfile ?? []).length)
})
