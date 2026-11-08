// "People with a current certification" (sheet rows 59, 78) — migration
// 20261110000004. Checks that club_certified_people() (mobile Home tile) gives
// the same figures as the portal's rules (certifiedFigures/certifiedThisMonth in
// lib/cert-summary.ts), for a throwaway club and for every real club (read-only).
//
//   node supabase/tests/club-certified-people.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('ccp')

const slToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date())
const monthStart = `${slToday.slice(0, 7)}-01`

// The portal's rules, over certificate_statuses rows.
function portalFigures(people, rows) {
  const ok = rows.filter(r => r.status === 'valid' || r.status === 'expiring_soon')
  let certified = 0, newThisMonth = 0
  for (const p of people) {
    const mine = ok.filter(r => r.holder_id === p)
    if (!mine.length) continue
    certified++
    if (mine.every(r => r.achieved_on >= monthStart)) newThisMonth++
  }
  return { people: people.length, certified, newThisMonth }
}

async function clubPortal(clubId) {
  const { data: members } = await admin.from('profiles').select('id').eq('club_id', clubId).eq('is_active', true).in('role', ['champion', 'gatekeeper'])
  const ids = (members ?? []).map(m => m.id)
  const { data: rows } = ids.length
    ? await admin.from('certificate_statuses').select('holder_id, status, achieved_on').eq('is_current', true).is('removed_at', null).in('holder_id', ids)
    : { data: [] }
  return portalFigures(ids, rows ?? [])
}

await run(async () => {
  const A = await mkClub('A')
  const ch = await mkUser('champ', 'champion', A)
  const gk1 = await mkUser('gk1', 'gatekeeper', A)
  await mkUser('gk2', 'gatekeeper', A)
  const certIds = []
  onCleanup(async () => {
    if (certIds.length) {
      await admin.from('certificate_events').delete().in('certificate_id', certIds)
      await admin.from('certificates').delete().in('id', certIds)
    }
  })
  const { data: type } = await admin.from('certification_types').select('id').limit(1).maybeSingle()
  if (type) {
    const { data: cert, error } = await admin.from('certificates').insert({ holder_id: gk1.id, type_id: type.id, achieved_on: slToday }).select('id').single()
    if (cert) certIds.push(cert.id)
    check('test certificate created', !error, error?.message)
  }

  const { data: mine, error } = await ch.db.rpc('club_certified_people')
  const db = mine?.[0]
  const portal = await clubPortal(A)
  check('throwaway club: same as the portal', !error && Number(db.people) === portal.people && Number(db.certified) === portal.certified && Number(db.certified_this_month) === portal.newThisMonth,
    `db ${JSON.stringify(db)} portal ${JSON.stringify(portal)} ${error?.message ?? ''}`)
  check('a Gatekeeper gets their own club too', (await gk1.db.rpc('club_certified_people')).data?.[0]?.people == portal.people)

  // Every real club, read-only: sign in as nobody — compare via a Champion of that club is
  // not possible without their password, so compare the SQL rules directly.
  const { data: clubs } = await admin.from('clubs').select('id, name').not('name', 'ilike', 'ZZ RLS%')
  for (const c of clubs ?? []) {
    const portalC = await clubPortal(c.id)
    const { data: rows } = await admin.from('certificate_statuses').select('holder_id, status, achieved_on, is_current, removed_at')
      .eq('is_current', true).is('removed_at', null).in('status', ['valid', 'expiring_soon'])
    const { data: members } = await admin.from('profiles').select('id').eq('club_id', c.id).eq('is_active', true).in('role', ['champion', 'gatekeeper'])
    const ids = new Set((members ?? []).map(m => m.id))
    const first = new Map()
    for (const r of rows ?? []) if (ids.has(r.holder_id)) first.set(r.holder_id, [first.get(r.holder_id), r.achieved_on].filter(Boolean).sort()[0])
    const sql = { people: ids.size, certified: first.size, newThisMonth: [...first.values()].filter(d => d >= monthStart).length }
    check(`club "${c.name}": SQL rule = portal rule`, JSON.stringify(sql) === JSON.stringify(portalC), `${JSON.stringify(sql)} vs ${JSON.stringify(portalC)}`)
  }
})
