// Database tests for Security Finding 2 — a deactivated user can't read or
// change anything, by any route, and their sessions end. Calls Supabase
// directly with each user's own (still unexpired) access token, i.e. what a
// deactivated user's phone or browser could still send.
//
//   node supabase/tests/deactivated-user-rls.mjs     (from the project root)
//
// Needs migration 20261112000001.
import crypto from 'crypto'
import { admin, newAnonClient, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f2')
// If a check fails, a deactivated Super Admin may really have created a club.
onCleanup(async () => { await admin.from('clubs').delete().like('name', 'ZZ RLS f2 nope%') })

const count = async q => { const { data, error } = await q; return error ? -1 : (data?.length ?? 0) }

async function setActive(id, active) {
  const { error } = await admin.from('profiles').update(active
    ? { is_active: true, deactivation_reason: null }
    : { is_active: false, deactivation_reason: 'manual' }).eq('id', id)
  if (error) throw error
}

// Signs in again with a fresh password (to test reactivation).
async function signInAgain(id) {
  const password = 'Zz!' + crypto.randomBytes(12).toString('base64url') + '9a'
  await admin.auth.admin.updateUserById(id, { password })
  const { data: p } = await admin.from('profiles').select('email').eq('id', id).single()
  const db = newAnonClient()
  const { error } = await db.auth.signInWithPassword({ email: p.email, password })
  if (error) throw error
  return db
}

await run(async () => {
  const A = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const ch = await mkUser('ch', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)
  const other = await mkUser('gk2', 'gatekeeper', A)

  // Baseline: everyone active can read what they normally read.
  check('active Gatekeeper: reads own profile', await count(gk.db.from('profiles').select('id').eq('id', gk.id)) === 1)
  check('active Gatekeeper: reads own club', await count(gk.db.from('clubs').select('id').eq('id', A)) === 1)
  check('active Champion: reads club Gatekeepers', await count(ch.db.from('profiles').select('id').eq('id', gk.id)) === 1)
  check('active Super Admin: reads clubs', await count(sa.db.from('clubs').select('id').eq('id', A)) === 1)
  const { error: moodOk } = await gk.db.from('mood_checkins').insert({ gatekeeper_id: gk.id, mood: 'okay' })
  check('active Gatekeeper: can log a mood', !moodOk, moodOk?.message)
  const resourcesBefore = (await gk.db.storage.from('resources').list('', { limit: 5 })).data?.length ?? 0

  // Deactivate all three while their tokens are still valid.
  const gkSession = (await gk.db.auth.getSession()).data.session
  await setActive(gk.id, false); await setActive(ch.id, false); await setActive(sa.id, false)

  for (const [label, u] of [['Gatekeeper', gk], ['Champion', ch], ['Super Admin', sa]]) {
    check(`deactivated ${label}: own profile not readable`, await count(u.db.from('profiles').select('id').eq('id', u.id)) === 0)
    check(`deactivated ${label}: clubs not readable`, await count(u.db.from('clubs').select('id')) <= 0)
    check(`deactivated ${label}: permissions not readable`, await count(u.db.from('permissions').select('id')) <= 0)
    check(`deactivated ${label}: audit/role overrides not readable`, await count(u.db.from('role_overrides').select('id')) <= 0)
    const { data: st } = await u.db.rpc('my_account_status')
    check(`deactivated ${label}: my_account_status says inactive`, st?.[0]?.is_active === false, JSON.stringify(st))
    const { data: access } = await u.db.rpc('my_access_list')
    check(`deactivated ${label}: my_access_list returns nothing`, !access || access.length === 0)
  }

  check('deactivated Champion: can’t read club Gatekeepers', await count(ch.db.from('profiles').select('id').eq('id', other.id)) === 0)
  const { error: moodErr } = await gk.db.from('mood_checkins').insert({ gatekeeper_id: gk.id, mood: 'low' })
  check('deactivated Gatekeeper: can’t log a mood', !!moodErr)
  check('deactivated Gatekeeper: can’t read own moods', await count(gk.db.from('mood_checkins').select('id')) <= 0)
  const { error: updErr, data: upd } = await gk.db.from('profiles').update({ full_name: 'hacked' }).eq('id', gk.id).select('id')
  check('deactivated Gatekeeper: can’t update own profile', !!updErr || !upd?.length)
  const { error: clubErr } = await sa.db.from('clubs').insert({ name: `ZZ RLS f2 nope ${crypto.randomBytes(3).toString('hex')}`, club_code: `ZZ-${crypto.randomBytes(3).toString('hex')}`, location: 'x' })
  check('deactivated Super Admin: can’t create a club', !!clubErr)
  const { error: permErr } = await gk.db.rpc('effective_permission', { p_user_id: gk.id, p_permission: 'view_events' })
  check('deactivated Gatekeeper: can’t resolve permissions', !!permErr)
  const resourcesAfter = (await gk.db.storage.from('resources').list('', { limit: 5 })).data?.length ?? 0
  check('deactivated Gatekeeper: storage files not listable', resourcesAfter === 0, resourcesBefore === 0 ? '(bucket empty: inconclusive)' : `${resourcesAfter} files`)
  if (resourcesBefore === 0) console.log('note: resources bucket empty, storage check is inconclusive')

  // Sessions ended.
  const { data: rows } = await admin.rpc('my_account_status') // service role: no caller → no row
  check('service role has no "own status"', !rows || rows.length === 0)
  const refresh = await newAnonClient().auth.refreshSession({ refresh_token: gkSession.refresh_token })
  check('deactivated Gatekeeper: refresh token no longer works (session revoked)', !!refresh.error || !refresh.data.session, 'refresh succeeded')

  // Signed-out caller can't read anyone's permissions (the old NULL hole).
  const { data: anonPerm, error: anonErr } = await newAnonClient().rpc('effective_permission', { p_user_id: other.id, p_permission: 'view_events' })
  check('not signed in: effective_permission refused', !!anonErr || !anonPerm?.length)
  const { error: gkOtherErr } = await other.db.rpc('list_effective_permissions', { p_user_id: ch.id })
  check('active Gatekeeper: still can’t resolve someone else’s permissions', !!gkOtherErr)
  // effective_permission is server-only since Finding 5; apps use list_effective_permissions.
  const { error: gkSelfErr } = await other.db.rpc('list_effective_permissions', { p_user_id: other.id })
  check('active Gatekeeper: can still resolve their own permissions', !gkSelfErr, gkSelfErr?.message)

  // Reactivation restores access (after signing in again).
  await setActive(gk.id, true)
  const gkAgain = await signInAgain(gk.id)
  check('reactivated Gatekeeper: reads own profile again', await count(gkAgain.from('profiles').select('id').eq('id', gk.id)) === 1)
  const { error: moodBack } = await gkAgain.from('mood_checkins').insert({ gatekeeper_id: gk.id, mood: 'good' })
  check('reactivated Gatekeeper: can log a mood again', !moodBack, moodBack?.message)
  await admin.from('mood_checkins').delete().eq('gatekeeper_id', gk.id)
})
