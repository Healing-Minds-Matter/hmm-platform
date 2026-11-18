// Database tests for Review Finding 3 — an account still on a temporary
// password (must_change_password) can only read its own profile until the
// password really changes, and the flag clears itself when it does (through
// Supabase Auth, as the app and web do). Calls Supabase directly.
//
//   node supabase/tests/review-f3-temporary-passwords-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise). Needs migrations 20261113000000-01.
import './_local-only.mjs'

const { admin, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, run } = rlsSuite('rf3')

await run(async () => {
  const club = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', club)
  const ch = await mkUser('ch', 'champion', club)
  const other = await mkUser('gk-ok', 'gatekeeper', club)

  // Flag them, as the migration does for accounts still on a temporary password.
  await admin.from('profiles').update({ must_change_password: true }).in('id', [gk.id, ch.id])

  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch]]) {
    const { data: clubs } = await who.db.from('clubs').select('id')
    check(`flagged ${label}: reads no clubs`, !clubs?.length)
    const { data: people } = await who.db.from('profiles').select('id').neq('id', who.id)
    check(`flagged ${label}: reads no other profiles`, !people?.length)
    const { data: me } = await who.db.from('profiles').select('must_change_password').eq('id', who.id).maybeSingle()
    check(`flagged ${label}: reads own profile`, me?.must_change_password === true)
    const { data: status } = await who.db.rpc('my_account_status')
    check(`flagged ${label}: my_account_status() says a change is needed`, (Array.isArray(status) ? status[0] : status)?.must_change_password === true)
    const { error: clearErr, data: cleared } = await who.db.from('profiles').update({ must_change_password: false }).eq('id', who.id).select('id')
    check(`flagged ${label}: can’t clear the flag directly`, !!clearErr || !cleared?.length)
  }
  const { error: moodErr } = await gk.db.from('mood_checkins').insert({ gatekeeper_id: gk.id, mood: 'okay' })
  check('flagged Gatekeeper: can’t save a mood check-in', !!moodErr)
  const { data: okClubs } = await other.db.from('clubs').select('id')
  check('Gatekeeper who isn’t flagged: still reads their club', okClubs?.length === 1)

  // The password changes through Supabase Auth → flag clears → access back.
  const { error: pwErr } = await gk.db.auth.updateUser({ password: 'Kandy-Lake-River-42!' })
  check('flagged Gatekeeper can change their password', !pwErr)
  const { data: after } = await admin.from('profiles').select('must_change_password').eq('id', gk.id).single()
  check('changing the password cleared the flag (database trigger)', after?.must_change_password === false)
  const { data: back } = await gk.db.from('clubs').select('id')
  check('…and the Gatekeeper reads their club again', back?.length === 1)

  // A Champion's flag is cleared the same way by an admin-set password (set-password link path).
  await admin.auth.admin.updateUserById(ch.id, { password: 'Galle-Fort-Harbour-77!' })
  const { data: chAfter } = await admin.from('profiles').select('must_change_password').eq('id', ch.id).single()
  check('a server-set password (set-password link) also clears the flag', chAfter?.must_change_password === false)
})
