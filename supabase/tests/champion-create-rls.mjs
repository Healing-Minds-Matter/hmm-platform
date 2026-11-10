// Database tests for Security Finding 1 — who can create a Champion profile,
// and into which club. Calls Supabase directly as each kind of user (what a
// forged request could do with no app code in the way).
//
//   node supabase/tests/champion-create-rls.mjs     (from the project root)
//
// The "inactive club" checks need migration 20261112000000 applied.
// The "deactivated Super Admin" check needs Finding 2's migration.
import crypto from 'crypto'
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f1')

const targets = []
onCleanup(async () => {
  if (!targets.length) return
  await admin.from('profiles').delete().in('id', targets)
  for (const id of targets) await admin.auth.admin.deleteUser(id)
})

// A fresh auth user with no profile yet: what createInvitedUser() leaves behind.
async function newAuthUser() {
  const email = `zz-rls-f1-target-${crypto.randomBytes(4).toString('hex')}@example.com`
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Zz!' + crypto.randomBytes(12).toString('base64url'), email_confirm: true })
  if (error) throw error
  targets.push(data.user.id)
  return { id: data.user.id, email }
}

async function tryCreateChampion(db, clubId) {
  const t = await newAuthUser()
  const { error } = await db.from('profiles').insert({
    id: t.id, full_name: 'ZZ RLS f1 target', email: t.email, role: 'champion', club_id: clubId, is_active: true, must_change_password: true,
  })
  const { data: row } = await admin.from('profiles').select('id').eq('id', t.id).maybeSingle()
  return { error, created: !!row, id: t.id }
}

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const OFF = await mkClub('Off')
  await admin.from('clubs').update({ is_active: false }).eq('id', OFF)

  const sa = await mkUser('sa', 'super_admin', null)
  const saOff = await mkUser('sa-off', 'super_admin', null)
  const champA = await mkUser('champ-a', 'champion', A)
  const gkA = await mkUser('gk-a', 'gatekeeper', A)
  const anon = await mkUser('anon', 'gatekeeper', A)
  await anon.db.auth.signOut() // now an anonymous client holding only the public key
  await admin.from('profiles').update({ is_active: false }).eq('id', saOff.id)

  let r = await tryCreateChampion(anon.db, A)
  check('not signed in: cannot create a Champion', !r.created, r.error?.message)
  r = await tryCreateChampion(gkA.db, A)
  check('Gatekeeper: cannot create a Champion', !r.created)
  r = await tryCreateChampion(champA.db, A)
  check('Champion (own club): cannot create a Champion', !r.created)
  r = await tryCreateChampion(champA.db, B)
  check('Champion (other club): cannot create a Champion', !r.created)
  r = await tryCreateChampion(gkA.db, A)
  check('Gatekeeper: cannot promote via insert', !r.created)

  r = await tryCreateChampion(sa.db, A)
  check('Super Admin: can create a Champion in an active club', r.created, r.error?.message)

  r = await tryCreateChampion(sa.db, OFF)
  check('Super Admin: cannot create a Champion in an inactive club [migration 20261112000000]', !r.created && r.error?.code === '23514', r.error?.message ?? 'row was created')
  r = await tryCreateChampion(admin, OFF)
  check('service role: cannot create a Champion in an inactive club either [migration 20261112000000]', !r.created && r.error?.code === '23514', r.error?.message ?? 'row was created')
  r = await tryCreateChampion(sa.db, null)
  check('Super Admin: cannot create a Champion with no club [migration 20261112000000]', !r.created, r.error?.message ?? 'row was created')

  // Existing Champions are untouched when their club is later deactivated.
  const ok = await tryCreateChampion(sa.db, B)
  await admin.from('clubs').update({ is_active: false }).eq('id', B)
  const { error: renameErr } = await sa.db.from('profiles').update({ full_name: 'ZZ RLS f1 renamed' }).eq('id', ok.id)
  check('existing Champion in a now-inactive club can still be edited', !renameErr, renameErr?.message)
  const { error: moveErr } = await sa.db.from('profiles').update({ club_id: OFF }).eq('id', ok.id)
  check('…but cannot be moved into an inactive club [migration 20261112000000]', moveErr?.code === '23514', moveErr?.message ?? 'move succeeded')

  r = await tryCreateChampion(saOff.db, A)
  check('deactivated Super Admin: cannot create a Champion [Finding 2]', !r.created)
})
