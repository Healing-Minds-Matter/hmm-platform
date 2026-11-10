// Database tests for Security Finding 5 — who may call database functions,
// permission data, and the append-only audit log. Calls Supabase directly
// as a signed-out caller, a Gatekeeper, a Super Admin and the server.
//
//   node supabase/tests/function-grants-rls.mjs     (from the project root)
//
// Needs migration 20261112000004.
import { admin, newAnonClient, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f5')

const Z = '00000000-0000-4000-8000-000000000000'
// Every client-reachable function, with harmless arguments.
const CALLS = {
  // Called by the apps (signed-in users need these)
  announcement_recipient_count: { p_audience: 'all', p_is_all_clubs: true, p_club_ids: [], p_recipient_ids: [] },
  announcement_source_labels: { p_announcement_ids: [Z] },
  cert_can: { p_permission: 'certifications.award' },
  cert_in_scope: { p_holder: Z },
  certification_stats: {},
  club_certified_people: {},
  event_details_extra: { p_event_id: Z },
  event_registrants: { p_event_id: Z },
  event_registration_counts: { p_event_ids: [Z] },
  list_effective_permissions: { p_user_id: Z },
  my_access_list: {},
  my_account_status: {},
  // Used by access rules (signed-in users need these)
  current_user_role: {}, current_user_club_id: {}, is_active_user: {},
  user_can_see_event: { p_event_id: Z }, announcement_reaches_me: { p_announcement_id: Z },
  announcement_linked_to_my_club: { p_announcement_id: Z }, champion_can_manage_event: { p_event_id: Z },
  champion_can_link_event: { p_event_id: Z, p_club_id: Z }, champion_can_link_announcement: { p_announcement_id: Z, p_club_id: Z },
  event_registration_refusal: { p_event_id: Z },
  // Internal only: never callable by any client
  effective_permission: { p_user_id: Z, p_permission: 'view_events' },
  effective_permission_with_delegation: { p_user_id: Z, p_permission: 'view_events' },
  qpr_certification_stats: {},
  cert_actor_label: {},
  cert_audit: { p_action: 'x', p_entity_type: 'x', p_entity_id: Z, p_details: {} },
  cert_notify: { p_to: Z, p_kind: 'x', p_body: 'x', p_link: {} },
  cert_effective_unchecked: { p_user: Z, p_permission: 'x' },
  cert_club_champions: { p_holder: Z },
  cert_sync_legacy_qpr: { p_holder: Z },
  cert_send_expiry_reminders: { p_holder: Z },
  next_certificate_number: { p_type: Z, p_year: 2026 },
  next_gatekeeper_code: {},
}
const SIGNED_IN = new Set(Object.keys(CALLS).slice(0, Object.keys(CALLS).indexOf('effective_permission')))

// "Can't call" = refused by the database's EXECUTE grant (or hidden from the
// API) — not a refusal written inside the function, which is checked separately.
const denied = e => !!e && (e.code === 'PGRST202' || /permission denied for function/i.test(e.message ?? ''))

await run(async () => {
  const A = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const gk2 = await mkUser('gk2', 'gatekeeper', A)
  const sa = await mkUser('sa', 'super_admin', null)
  const anon = newAnonClient()
  const auditIds = []
  onCleanup(async () => { if (auditIds.length) await admin.from('audit_logs').delete().in('id', auditIds) })

  // ── Signed-out: no function at all ──
  for (const [fn, args] of Object.entries(CALLS)) {
    const { error } = await anon.rpc(fn, args)
    check(`not signed in: can't call ${fn}`, denied(error), error ? `${error.code} ${error.message}` : 'call succeeded')
  }

  // ── Gatekeeper: only what signed-in users need ──
  for (const [fn, args] of Object.entries(CALLS)) {
    const { error } = await gk.db.rpc(fn, args)
    if (SIGNED_IN.has(fn)) check(`Gatekeeper: may call ${fn}`, !denied(error), `${error?.code} ${error?.message}`)
    else check(`Gatekeeper: can't call internal ${fn}`, denied(error), error ? `${error.code} ${error.message}` : 'call succeeded')
  }

  // ── Permission data: themselves or admins only ──
  const { error: otherPerm } = await gk.db.rpc('list_effective_permissions', { p_user_id: gk2.id })
  check('Gatekeeper: can’t read another user’s permissions', !!otherPerm)
  const { data: ownPerm, error: ownErr } = await gk.db.rpc('list_effective_permissions', { p_user_id: gk.id })
  check('Gatekeeper: can read own permissions', !ownErr && Array.isArray(ownPerm), ownErr?.message)
  const { error: saPerm } = await sa.db.rpc('list_effective_permissions', { p_user_id: gk.id })
  check('Super Admin: can read anyone’s permissions', !saPerm, saPerm?.message)
  for (const t of ['permissions', 'role_overrides', 'group_members', 'group_permissions', 'permission_groups', 'role_delegations', 'permission_catalog', 'v_active_role_delegations']) {
    const { data, error } = await anon.from(t).select('*').limit(1)
    check(`not signed in: can't read ${t}`, !!error || (data ?? []).length === 0, `${data?.length} rows`)
  }

  // ── Audit log: append-only, written by the database/server only ──
  for (const [label, who] of [['not signed in', { db: anon }], ['Gatekeeper', gk], ['Super Admin', sa]]) {
    const { error } = await who.db.from('audit_logs').insert({ actor_id: gk2.id, action: 'zz.forged', entity_type: 'x' })
    check(`${label}: can't write an audit entry directly`, !!error)
  }
  const { data: entry } = await admin.from('audit_logs').insert({ actor_id: sa.id, action: 'zz.f5.test', entity_type: 'test' }).select('id').single()
  auditIds.push(entry.id)
  await sa.db.from('audit_logs').update({ action: 'zz.f5.edited' }).eq('id', entry.id)
  await sa.db.from('audit_logs').delete().eq('id', entry.id)
  const { data: still } = await admin.from('audit_logs').select('action').eq('id', entry.id).maybeSingle()
  check('Super Admin: can’t edit or delete audit entries', still?.action === 'zz.f5.test', JSON.stringify(still))
  const { error: svcUpd } = await admin.from('audit_logs').update({ action: 'zz.f5.edited' }).eq('id', entry.id)
  check('server (service role): can’t edit audit entries either', !!svcUpd, 'update allowed')
  const { data: saRead } = await sa.db.from('audit_logs').select('id').eq('id', entry.id)
  check('Super Admin: can still read the audit log', (saRead ?? []).length === 1)
})
