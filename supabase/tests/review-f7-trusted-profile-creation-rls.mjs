// Database tests for Review Finding 7 — only trusted server code creates
// profiles; a Champion can't write a Gatekeeper profile (or an official QPR
// certificate through it) directly; a self-signed-up account gets no access.
//
//   node supabase/tests/review-f7-trusted-profile-creation-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise). Needs migration 20261113000003.
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf7')

await run(async () => {
  const club = await mkClub('A')
  const sa = await mkUser('sa', 'super_admin', null)
  const ch = await mkUser('ch', 'champion', club)
  const gk = await mkUser('gk', 'gatekeeper', club)

  const authUser = async (label, meta = {}) => {
    const email = `zz-rls-rf7-${label}-${Date.now()}@example.com`
    const { data } = await admin.auth.admin.createUser({ email, password: 'Zz!' + Math.random().toString(36).slice(2) + 'Aa9', email_confirm: true, user_metadata: meta })
    onCleanup(async () => { await admin.auth.admin.deleteUser(data.user.id) })
    return { id: data.user.id, email }
  }
  const row = (u, role, extra = {}) => ({ id: u.id, full_name: 'ZZ RLS rf7', email: u.email, role, club_id: club, is_active: true, phone: `+9475${String(Date.now()).slice(-7)}`, ...extra })

  const t1 = await authUser('t1')
  const { error: chErr } = await ch.db.from('profiles').insert(row(t1, 'gatekeeper', { qpr_certification_date: '2026-01-15' }))
  check('Champion can’t create a Gatekeeper profile directly (with a QPR date)', !!chErr)
  const { data: certs } = await admin.from('certificates').select('id').eq('holder_id', t1.id)
  check('…and no official certificate was created', !certs?.length)

  for (const [label, client] of [['Gatekeeper', gk.db], ['signed out', newAnonClient()]]) {
    const u = await authUser(label.replace(/\s/g, ''))
    const { error } = await client.from('profiles').insert(row(u, 'gatekeeper'))
    check(`${label} can’t create a profile`, !!error)
  }
  const t2 = await authUser('t2')
  check('Super Admin can’t create a Super Admin profile from the client', !!(await sa.db.from('profiles').insert(row(t2, 'super_admin', { club_id: null }))).error)
  const t3 = await authUser('t3')
  check('Super Admin can create a Champion (Add Champion screen)', !(await sa.db.from('profiles').insert(row(t3, 'champion'))).error)
  onCleanup(async () => { await admin.from('profiles').delete().eq('id', t3.id) })

  // Self sign-up with role metadata: no profile → no access.
  const self = await authUser('self', { role: 'super_admin', club_id: club })
  const { data: prof } = await admin.from('profiles').select('id').eq('id', self.id)
  check('self sign-up with role metadata gets no profile', !prof?.length)
})
