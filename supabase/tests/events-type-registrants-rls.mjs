// Database-rule tests for events (sheet rows 43, 57, 66) — migration
// 20261110000002. Run after the migration is applied:
//
//   node supabase/tests/events-type-registrants-rls.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('evt')

await run(async () => {
  const A = await mkClub('A'), B = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const chA = await mkUser('champ-a', 'champion', A)
  const gkA = await mkUser('gk-a', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)
  const ids = []
  onCleanup(async () => {
    if (ids.length) {
      await admin.from('event_registrations').delete().in('event_id', ids)
      await admin.from('events').delete().in('id', ids)
    }
  })

  const start = new Date(Date.now() + 7 * 864e5).toISOString()
  const save = (who, extra = {}) => who.db.rpc('save_event', {
    p_event_id: null, p_title: 'ZZ RLS event', p_type: 'workshop', p_starts_at: start, p_ends_at: null, p_venue: 'Hall',
    p_description: null, p_max_participants: null, p_facilitator: 'F', p_virtual_link: null,
    p_is_all_clubs: false, p_club_ids: [B], p_type_description: null, ...extra,
  }).then(r => { if (r.data) ids.push(r.data); return r })

  // ── Row 43 ──
  const noDesc = await save(sa, { p_type: 'other' })
  check('"Other" without a description is refused', !!noDesc.error && /Describe the event type/.test(noDesc.error.message), noDesc.error?.message)
  const other = await save(sa, { p_type: 'other', p_type_description: '  Parent evening ' })
  const { data: otherRow } = await admin.from('events').select('type_description').eq('id', other.data).single()
  check('"Other" keeps its trimmed description', otherRow?.type_description === 'Parent evening', otherRow?.type_description)
  const ws = await save(sa, { p_type: 'workshop', p_type_description: 'ignored' })
  const { data: wsRow } = await admin.from('events').select('type_description').eq('id', ws.data).single()
  check('other types store no description', wsRow?.type_description === null)
  const raw = await sa.db.from('events').update({ type: 'other', type_description: null }).eq('id', ws.data).select('id')
  check('a direct change to "Other" without a description is refused (constraint)', !!raw.error, 'updated')

  // ── Row 57: a Champion reads other clubs' events, can't edit them ──
  const seen = await chA.db.from('events').select('id, event_clubs(club_id)').eq('id', ws.data).maybeSingle()
  check("Champion A sees club B's event", !!seen.data, seen.error?.message)
  check("…and its club link (for the club filter)", seen.data?.event_clubs?.[0]?.club_id === B)
  const edit = await chA.db.from('events').update({ title: 'hacked' }).eq('id', ws.data).select('id')
  check("Champion A can't edit club B's event", (edit.data ?? []).length === 0)
  const gkSeen = await gkA.db.from('events').select('id').eq('id', ws.data).maybeSingle()
  check("Gatekeeper A still doesn't see club B's event", !gkSeen.data)

  // ── Row 66: registrants ──
  const both = await save(sa, { p_club_ids: [A, B] })
  await admin.from('event_registrations').insert([{ event_id: both.data, gatekeeper_id: gkA.id }, { event_id: both.data, gatekeeper_id: gkB.id }])
  const saList = await sa.db.rpc('event_registrants', { p_event_id: both.data })
  check('Super Admin sees every registrant, with club and time', saList.data?.length === 2 && saList.data.every(r => r.club_name && r.registered_at), JSON.stringify(saList.error ?? saList.data))
  const chList = await chA.db.rpc('event_registrants', { p_event_id: both.data })
  check('Champion A sees only their own club', chList.data?.length === 1 && chList.data[0].user_id === gkA.id, JSON.stringify(chList.error ?? chList.data))
  const direct = await chA.db.from('event_registrations').select('gatekeeper_id').eq('event_id', both.data)
  check("Champion A can't read club B's registration directly either", (direct.data ?? []).every(r => r.gatekeeper_id === gkA.id) && direct.data?.length === 1)
  const gkList = await gkA.db.rpc('event_registrants', { p_event_id: both.data })
  check('a Gatekeeper may not list registrants', !!gkList.error)
})
