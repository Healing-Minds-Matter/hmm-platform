// Database tests for Review Finding 6 — a club's status changes only through
// set_club_active() (Super Admins, one transaction, audited), and a member of
// an inactive club gets no access even if their own profile is still active.
//
//   node supabase/tests/review-f6-club-active-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise). Needs migration 20261113000002.
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf6')

await run(async () => {
  const clubA = await mkClub('A'), clubB = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const saOff = await mkUser('sa-off', 'super_admin', null)
  const chA = await mkUser('ch-a', 'champion', clubA)
  const gkA = await mkUser('gk-a', 'gatekeeper', clubA)
  const gkB = await mkUser('gk-b', 'gatekeeper', clubB)
  await admin.from('profiles').update({ is_active: false, deactivation_reason: 'manual' }).eq('id', saOff.id)
  onCleanup(async () => { await admin.from('audit_logs').delete().in('entity_id', [clubA, clubB]) })

  for (const [label, client] of [['signed out', newAnonClient()], ['Gatekeeper', gkA.db], ['Champion', chA.db], ['deactivated Super Admin', saOff.db]]) {
    const { error } = await client.rpc('set_club_active', { p_club_id: clubA, p_active: false })
    check(`${label}: set_club_active() refused`, !!error)
  }
  const { data: direct } = await sa.db.from('clubs').update({ is_active: false }).eq('id', clubA).select('id')
  const { data: stillOn } = await admin.from('clubs').select('is_active').eq('id', clubA).single()
  check('Super Admin: a direct status update is refused', !direct?.length && stillOn?.is_active === true)

  // Second lock: the server (service role) switches club B off without the cascade.
  await admin.from('clubs').update({ is_active: false }).eq('id', clubB)
  const { data: bClubs } = await gkB.db.from('clubs').select('id')
  check('Gatekeeper of an inactive club (profile still active) reads nothing', !bClubs?.length)
  const { data: st } = await gkB.db.rpc('my_account_status')
  const row = Array.isArray(st) ? st[0] : st
  check('…and is told their club is inactive', row?.is_active === false && row?.deactivation_reason === 'club_deactivated')
  await admin.from('clubs').update({ is_active: true }).eq('id', clubB)

  const { data: off, error: offErr } = await sa.db.rpc('set_club_active', { p_club_id: clubA, p_active: false })
  check('Super Admin deactivates club A', !offErr && off?.changed === true)
  const { data: members } = await admin.from('profiles').select('id, is_active, deactivation_reason').eq('club_id', clubA)
  check('…its members are deactivated (club_deactivated)', members?.every(m => !m.is_active && m.deactivation_reason === 'club_deactivated'))
  const { error: refreshErr } = await gkA.db.auth.refreshSession()
  check('…a member’s session can no longer be refreshed', !!refreshErr)
  const { data: log } = await admin.from('audit_logs').select('actor_id').eq('entity_id', clubA).eq('action', 'club.deactivated')
  check('…audited once, by the Super Admin', log?.length === 1 && log[0].actor_id === sa.id)

  const { data: on } = await sa.db.rpc('set_club_active', { p_club_id: clubA, p_active: true })
  const { data: back } = await admin.from('profiles').select('is_active').eq('id', gkA.id).single()
  check('Super Admin reactivates → members restored', on?.changed === true && back?.is_active === true)
})
