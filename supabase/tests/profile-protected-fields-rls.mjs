// Database tests for Security Finding 3 — users can only change their own
// safe profile fields; protected fields only through authorised routes.
// Calls Supabase directly as each kind of user.
//
//   node supabase/tests/profile-protected-fields-rls.mjs     (from the project root)
//
// Needs migration 20261112000002.
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f3')

const AVATAR = id => `https://example.supabase.co/storage/v1/object/public/avatars/${id}/avatar.jpg?t=1`

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)
  const ch = await mkUser('ch', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)
  onCleanup(async () => {
    const ids = [gk.id, gkB.id, ch.id]
    await admin.from('certificate_events').delete().in('certificate_id', ((await admin.from('certificates').select('id').in('holder_id', ids)).data ?? []).map(c => c.id))
    await admin.from('notifications').delete().in('recipient_id', [...ids, sa.id])
    await admin.from('certificates').delete().in('holder_id', ids)
  })

  const row = async id => (await admin.from('profiles').select('*').eq('id', id).single()).data
  // Tries one change as `who`; returns whether it stuck.
  async function tryChange(who, targetId, patch) {
    const before = await row(targetId)
    const { error } = await who.db.from('profiles').update(patch).eq('id', targetId)
    const after = await row(targetId)
    const stuck = Object.keys(patch).every(k => JSON.stringify(after[k]) === JSON.stringify(patch[k]) && JSON.stringify(before[k]) !== JSON.stringify(patch[k]))
    return { stuck, error }
  }

  // ── Self: safe fields still editable ──
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch]]) {
    let r = await tryChange(who, who.id, { full_name: `ZZ RLS f3 ${label} renamed` })
    check(`${label}: can change own name`, r.stuck, r.error?.message)
    r = await tryChange(who, who.id, { preferred_language: 'si' })
    check(`${label}: can change own language`, r.stuck, r.error?.message)
    r = await tryChange(who, who.id, { title: 'Volunteer', office_location: 'Colombo' })
    check(`${label}: can change own title / office`, r.stuck, r.error?.message)
    r = await tryChange(who, who.id, { avatar_url: AVATAR(who.id) })
    check(`${label}: can set own avatar (own avatars folder)`, r.stuck, r.error?.message)
  }
  let r = await tryChange(gk, gk.id, { phone: '+94771239876' })
  check('Gatekeeper: can change own phone', r.stuck, r.error?.message)

  // ── Self: protected fields refused, with an error (not silently ignored) ──
  const protectedPatches = {
    email: { email: 'zz-rls-f3-stolen@example.com' },
    role: { role: 'super_admin' },
    club_id: { club_id: B },
    is_active: { is_active: false },
    qpr_certification_date: { qpr_certification_date: '2026-01-01' },
    qpr_expiry_date: { qpr_expiry_date: '2099-01-01' },
    gatekeeper_code: { gatekeeper_code: 'GK-HACK' },
    must_change_password: { must_change_password: false },
    created_at: { created_at: '2020-01-01T00:00:00Z' },
    avatar_url: { avatar_url: 'https://evil.example.com/track.gif' },
  }
  await admin.from('profiles').update({ must_change_password: true }).eq('id', gk.id)
  for (const [field, patch] of Object.entries(protectedPatches)) {
    r = await tryChange(gk, gk.id, patch)
    check(`Gatekeeper: can't change own ${field}`, !r.stuck && r.error?.code === '42501', r.stuck ? 'changed!' : `no error (${r.error?.code})`)
  }
  r = await tryChange(ch, ch.id, { club_id: B })
  check('Champion: can’t move themselves to another club', !r.stuck && !!r.error)
  r = await tryChange(ch, ch.id, { email: 'zz-rls-f3-champ-stolen@example.com' })
  check('Champion: can’t change own email directly', !r.stuck && !!r.error)

  // ── The QPR back door: no self-awarded official certificate ──
  const { count: certs } = await admin.from('certificates').select('id', { count: 'exact', head: true }).eq('holder_id', gk.id)
  check('Gatekeeper: setting own QPR date did not create an official certificate', (certs ?? 0) === 0, `${certs} certificate(s) created`)
  const { data: qprType } = await admin.from('certification_types').select('id').eq('code', 'QPR').maybeSingle()
  if (qprType) {
    const { error: certErr } = await gk.db.from('certificates').insert({ holder_id: gk.id, type_id: qprType.id, achieved_on: '2026-01-01', format: 'physical' })
    check('Gatekeeper: can’t insert an official certificate for themselves', !!certErr)
  }

  // ── Champion on own-club Gatekeeper ──
  r = await tryChange(ch, gk.id, { is_active: false, deactivation_reason: 'manual' })
  check('Champion: can deactivate own-club Gatekeeper', r.stuck, r.error?.message)
  r = await tryChange(ch, gk.id, { is_active: true, deactivation_reason: null })
  check('Champion: can reactivate own-club Gatekeeper', r.stuck, r.error?.message)
  r = await tryChange(ch, gk.id, { full_name: 'ZZ RLS f3 edited by champion', phone: '+94771239877' })
  check('Champion: can edit own-club Gatekeeper name/phone', r.stuck, r.error?.message)
  for (const [field, patch] of Object.entries({ email: { email: 'zz-rls-f3-takeover@example.com' }, role: { role: 'champion' }, gatekeeper_code: { gatekeeper_code: 'GK-X' }, qpr_certification_date: { qpr_certification_date: '2026-02-02' }, must_change_password: { must_change_password: false } })) {
    r = await tryChange(ch, gk.id, patch)
    check(`Champion: can't change own-club Gatekeeper's ${field}`, !r.stuck, 'changed!')
  }
  r = await tryChange(ch, gkB.id, { full_name: 'ZZ RLS f3 other club' })
  check('Champion: can’t edit another club’s Gatekeeper', !r.stuck)

  // ── The legitimate route still works: a Champion awards QPR, and the
  // certificate sync copies the date onto the profile (cert_syncing) ──
  if (qprType) {
    const { error: awardErr } = await ch.db.from('certificates').insert({ holder_id: gk.id, type_id: qprType.id, achieved_on: '2026-03-03', format: 'physical' })
    check('Champion: can award a QPR certificate to own-club Gatekeeper', !awardErr, awardErr?.message)
    const synced = (await row(gk.id)).qpr_certification_date
    check('…and the certificate sync still updates the profile QPR date', synced === '2026-03-03', String(synced))
  }

  // ── Super Admin ──
  r = await tryChange(sa, ch.id, { club_id: B })
  check('Super Admin: can move a Champion to another club', r.stuck, r.error?.message)
  r = await tryChange(sa, gk.id, { is_active: false, deactivation_reason: 'manual' })
  check('Super Admin: can deactivate a Gatekeeper', r.stuck, r.error?.message)
  r = await tryChange(sa, gk.id, { email: 'zz-rls-f3-sa-direct@example.com' })
  check('Super Admin: can’t change someone’s email directly (verified flow only)', !r.stuck && !!r.error)

  // ── Trusted server code (service role) ──
  const { error: svcErr } = await admin.from('profiles').update({ gatekeeper_code: 'GK-ZZF3' }).eq('id', gkB.id)
  check('server (service role): can change protected fields', !svcErr, svcErr?.message)
})
