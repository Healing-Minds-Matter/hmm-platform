// Database tests for Review Finding 4 — the app sends a mood check-in as
// upsert(…, { onConflict: 'id', ignoreDuplicates: true }) with its own id, so
// a retry of a check-in that already got through is accepted and stored once.
//
//   node supabase/tests/review-f4-mood-upsert-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise).
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf4')

await run(async () => {
  const club = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', club)
  const gk2 = await mkUser('gk2', 'gatekeeper', club)
  const ch = await mkUser('ch', 'champion', club)
  const sa = await mkUser('sa', 'super_admin', null)
  onCleanup(async () => { await admin.from('mood_checkins').delete().in('gatekeeper_id', [gk.id, gk2.id]) })

  const entry = { id: crypto.randomUUID(), gatekeeper_id: gk.id, mood: 'low', checked_in_at: '2026-11-12T08:00:00Z' }
  const send = (client, e) => client.from('mood_checkins').upsert(e, { onConflict: 'id', ignoreDuplicates: true })

  check('Gatekeeper: first send stores the check-in', !(await send(gk.db, entry)).error)
  check('Gatekeeper: the same check-in sent again is accepted', !(await send(gk.db, entry)).error)
  check('…and a changed copy is accepted without changing it', !(await send(gk.db, { ...entry, mood: 'great' })).error)
  const { data: rows } = await admin.from('mood_checkins').select('mood').eq('id', entry.id)
  check('…exactly one row, unchanged', rows?.length === 1 && rows[0].mood === 'low')

  check('Gatekeeper can’t send one for someone else', !!(await send(gk.db, { ...entry, id: crypto.randomUUID(), gatekeeper_id: gk2.id })).error)
  check('signed out is refused', !!(await send(newAnonClient(), { ...entry, id: crypto.randomUUID() })).error)
  for (const [label, who] of [['other Gatekeeper', gk2], ['Champion', ch], ['Super Admin', sa]]) {
    const { data } = await who.db.from('mood_checkins').select('id').eq('id', entry.id)
    check(`${label}: reads no one else’s check-in`, !data?.length)
  }
})
