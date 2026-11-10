// Database tests for Security Finding 10 — mood check-ins sent with a
// client-generated id: retries never duplicate, and moods stay private to
// the Gatekeeper. Calls Supabase directly as each kind of user.
//
//   node supabase/tests/mood-checkins-rls.mjs     (from the project root)
import crypto from 'crypto'
import { admin, newAnonClient, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f10')

await run(async () => {
  const A = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const gk2 = await mkUser('gk2', 'gatekeeper', A)
  const ch = await mkUser('ch', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)
  onCleanup(async () => { await admin.from('mood_checkins').delete().in('gatekeeper_id', [gk.id, gk2.id]) })

  // What the app sends: its own id and the time of the check-in.
  const entry = { id: crypto.randomUUID(), gatekeeper_id: gk.id, mood: 'heavy', checked_in_at: new Date(Date.now() - 3600e3).toISOString() }
  const { error: first } = await gk.db.from('mood_checkins').insert(entry)
  check('Gatekeeper: check-in with a client-generated id is saved', !first, first?.message)
  const { data: stored } = await admin.from('mood_checkins').select('id, checked_in_at').eq('id', entry.id).single()
  check('…with the time it was made (a retried check-in keeps its original time)', new Date(stored.checked_in_at).getTime() === new Date(entry.checked_in_at).getTime())
  const { error: retry } = await gk.db.from('mood_checkins').insert(entry)
  check('retrying the same check-in is refused as a duplicate (23505), not saved twice', retry?.code === '23505', retry?.code)
  const { count } = await admin.from('mood_checkins').select('id', { count: 'exact', head: true }).eq('id', entry.id)
  check('exactly one row', count === 1)

  // Private to the Gatekeeper.
  const { error: forOther } = await gk.db.from('mood_checkins').insert({ id: crypto.randomUUID(), gatekeeper_id: gk2.id, mood: 'great' })
  check('Gatekeeper: can’t log a mood for someone else', !!forOther)
  const { error: hijack } = await gk2.db.from('mood_checkins').insert({ ...entry, gatekeeper_id: gk2.id })
  check('another Gatekeeper reusing that id doesn’t touch the original', !!hijack && (await admin.from('mood_checkins').select('gatekeeper_id').eq('id', entry.id).single()).data.gatekeeper_id === gk.id)
  for (const [label, who] of [['another Gatekeeper', gk2], ['their Champion', ch], ['a Super Admin', sa], ['not signed in', { db: newAnonClient() }]]) {
    const { data } = await who.db.from('mood_checkins').select('id').eq('gatekeeper_id', gk.id)
    check(`${label}: can't read the Gatekeeper's moods`, (data ?? []).length === 0)
  }
  const { data: own } = await gk.db.from('mood_checkins').select('id').eq('id', entry.id)
  check('the Gatekeeper reads their own mood', (own ?? []).length === 1)
})
