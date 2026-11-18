// Database tests for Review Finding 9 — permission changes are audited by
// the database, once per real change, with the real caller; refused or no-op
// writes leave no entry.
//
//   node supabase/tests/review-f9-permission-audit-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise). Needs migration 20261113000005.
// Super Admin calls need a verified (aal2) session since Finding 8, so this
// uses a Champion for the refused cases and the service role is not used for
// writes (its entries would have no actor).
import './_local-only.mjs'

const { admin, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf9')

await run(async () => {
  const club = await mkClub('A')
  const ch = await mkUser('ch', 'champion', club)
  const gk = await mkUser('gk', 'gatekeeper', club)
  const sa = await mkUser('sa', 'super_admin', null)

  const { data: group } = await admin.from('permission_groups').insert({ name: `zz-rls-rf9-${Date.now()}`, created_by: sa.id }).select('id').single()
  onCleanup(async () => { await admin.from('permission_groups').delete().eq('id', group.id) })
  const { data: ov } = await admin.from('role_overrides').insert({ user_id: gk.id, permission: 'view_event_calendar', is_enabled: true, updated_by: sa.id }).select('id').single()
  onCleanup(async () => { await admin.from('role_overrides').delete().eq('id', ov.id) })
  onCleanup(async () => { await admin.from('audit_logs').delete().in('entity_id', [group.id, ov.id]) })

  const count = async (action, entity) => (await admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', action).eq('entity_id', entity)).count

  await ch.db.from('role_overrides').delete().eq('id', ov.id)
  check('Champion revokes an exception → nothing deleted, no entry', (await count('permission.individual_exception_revoked', ov.id)) === 0)
  await ch.db.from('permission_groups').update({ is_active: false }).eq('id', group.id)
  check('Champion archives a group → no entry', (await count('permission_group.archived', group.id)) === 0)
  await gk.db.from('group_permissions').upsert({ group_id: group.id, permission: 'view_event_calendar', is_enabled: true, updated_by: gk.id }, { onConflict: 'group_id,permission' })
  check('Gatekeeper sets a group permission → no entry', (await count('permission_group.permission_updated', group.id)) === 0)

  // Real changes through the server (service role): one entry each, no actor.
  await admin.from('permission_groups').update({ is_active: false }).eq('id', group.id)
  await admin.from('permission_groups').update({ is_active: false }).eq('id', group.id)
  check('group archived twice → exactly one entry', (await count('permission_group.archived', group.id)) === 1)
  await admin.from('role_overrides').delete().eq('id', ov.id)
  await admin.from('role_overrides').delete().eq('id', ov.id)
  check('exception revoked twice → exactly one entry', (await count('permission.individual_exception_revoked', ov.id)) === 1)
})
