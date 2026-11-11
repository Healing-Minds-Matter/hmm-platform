// Database tests for Review Finding 2 — a Champion can't take over a
// Gatekeeper account (email change / set-password link), and nobody but the
// Gatekeeper can read their mood check-ins. Calls Supabase directly as a
// signed-out caller, a Gatekeeper, Champions of the same and another club, a
// Super Admin, a deactivated Super Admin and the server (service role).
//
//   node supabase/tests/review-f2-account-takeover-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY: refuses to run unless .env.local points at 127.0.0.1 or
// localhost (there is only one hosted project and it is live).
// Needs migration 20261113000000.
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a local Supabase (127.0.0.1 / localhost).')
  process.exit(2)
}

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf2')

await run(async () => {
  const clubA = await mkClub('A'), clubB = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const saOff = await mkUser('sa-off', 'super_admin', null)
  const chA = await mkUser('ch-a', 'champion', clubA)
  const chB = await mkUser('ch-b', 'champion', clubB)
  const gkUsed = await mkUser('gk-used', 'gatekeeper', clubA)   // signed in (mkUser signs in)
  await admin.from('profiles').update({ is_active: false, deactivation_reason: 'manual' }).eq('id', saOff.id)

  // A Gatekeeper who has never signed in.
  const email = `zz-rls-rf2-gk-new-${Date.now()}@example.com`
  const { data: created } = await admin.auth.admin.createUser({ email, password: 'Zz!' + Math.random().toString(36).slice(2) + 'Aa9', email_confirm: true })
  const gkNew = created.user.id
  onCleanup(async () => { await admin.auth.admin.deleteUser(gkNew) })
  await admin.from('profiles').insert({ id: gkNew, full_name: 'ZZ RLS gk-new', email, role: 'gatekeeper', club_id: clubA, is_active: true, phone: `+9477${String(Date.now()).slice(-7)}` })

  const reqs = []
  onCleanup(async () => { await admin.from('email_change_requests').delete().in('user_id', [gkNew, gkUsed.id]) })
  onCleanup(async () => { await admin.from('account_setup_invites').delete().in('user_id', [gkNew, gkUsed.id]) })
  const request = async (user, by) => {
    const r = await admin.from('email_change_requests').insert({
      user_id: user, new_email: `zz-takeover-${reqs.length}@example.com`, token_hash: `rf2-${Date.now()}-${reqs.length}`,
      requested_by: by, expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }).select('id').single()
    reqs.push(r)
    return r
  }

  check('server: Champion starts email change for a Gatekeeper who has signed in → refused', !!(await request(gkUsed.id, chA.id)).error)
  check('server: Champion, own club, Gatekeeper never signed in → allowed', !(await request(gkNew, chA.id)).error)
  check('server: Champion of another club → refused', !!(await request(gkNew, chB.id)).error)
  check('server: Super Admin, Gatekeeper has signed in → allowed', !(await request(gkUsed.id, sa.id)).error)
  check('server: deactivated Super Admin → refused', !!(await request(gkUsed.id, saOff.id)).error)

  const invite = (user, by) => admin.from('account_setup_invites').insert({
    user_id: user, token_hash: `rf2-inv-${Date.now()}-${Math.random()}`, requested_by: by, expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
  }).select('id').single()
  check('server: set-password link for a never-signed-in Gatekeeper (own-club Champion) → allowed', !(await invite(gkNew, chA.id)).error)
  check('server: set-password link for an account that has signed in (Super Admin) → refused', !!(await invite(gkUsed.id, sa.id)).error)
  check('server: set-password link by a Champion of another club → refused', !!(await invite(gkNew, chB.id)).error)

  for (const [label, client] of [['signed out', newAnonClient()], ['Gatekeeper', gkUsed.db], ['Champion', chA.db], ['Super Admin', sa.db]]) {
    const { data: inv } = await client.from('account_setup_invites').select('id')
    check(`${label}: reads no set-password links`, !inv?.length)
    const { error: insErr } = await client.from('email_change_requests').insert({ user_id: gkNew, new_email: 'x@example.com', token_hash: `c-${Math.random()}`, expires_at: new Date(Date.now() + 1e6).toISOString() })
    check(`${label}: can’t create an email change request`, !!insErr)
    const { error: rpc1 } = await client.rpc('account_has_signed_in', { p_user_id: gkNew })
    check(`${label}: can’t call account_has_signed_in()`, !!rpc1)
    const { error: rpc2 } = await client.rpc('revoke_user_sessions', { p_user_id: gkUsed.id })
    check(`${label}: can’t call revoke_user_sessions()`, !!rpc2)
  }
  const { error: emailDirect } = await chA.db.from('profiles').update({ email: 'champion.own@example.com' }).eq('id', gkNew)
  check('Champion can’t write a Gatekeeper’s email directly', !!emailDirect)

  // Mood check-ins: only the Gatekeeper.
  const { error: moodIns } = await gkUsed.db.from('mood_checkins').insert({ gatekeeper_id: gkUsed.id, mood: 'low' })
  check('Gatekeeper saves own mood check-in', !moodIns)
  onCleanup(async () => { await admin.from('mood_checkins').delete().eq('gatekeeper_id', gkUsed.id) })
  for (const [label, client] of [['Champion (own club)', chA.db], ['Champion (other club)', chB.db], ['Super Admin', sa.db], ['signed out', newAnonClient()]]) {
    const { data } = await client.from('mood_checkins').select('id').eq('gatekeeper_id', gkUsed.id)
    check(`${label}: reads no mood check-ins`, !data?.length)
  }
})
