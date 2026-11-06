// Database tests for my_access_list() (sheet row 62) — migration 20261110000003.
// Run after the migration is applied:
//
//   node supabase/tests/access-list-rls.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('acc')

await run(async () => {
  const A = await mkClub('A')
  const sa = await mkUser('sa', 'super_admin', null)
  const ch = await mkUser('champ', 'champion', A)
  const ch2 = await mkUser('champ2', 'champion', A)
  onCleanup(async () => {
    await admin.from('role_overrides').delete().in('user_id', [ch.id, ch2.id])
    await admin.from('role_delegations').delete().eq('delegate_id', ch.id)
  })

  const keys = async who => ((await who.db.rpc('my_access_list')).data ?? []).map(r => r.key)
  const { data: catalog } = await admin.from('permission_catalog').select('key, label, restricted_to')
  const { data: defaults } = await admin.from('permissions').select('permission, is_enabled').eq('role', 'champion')

  // Role defaults, with the catalog labels.
  const rows = (await ch.db.rpc('my_access_list')).data ?? []
  const expected = (defaults ?? []).filter(d => d.is_enabled && catalog.some(c => c.key === d.permission)).map(d => d.permission).sort()
  check('Champion: exactly the enabled role defaults', JSON.stringify(rows.map(r => r.key).sort()) === JSON.stringify(expected), `${rows.map(r => r.key)} vs ${expected}`)
  check('…with the Permissions screen labels', rows.every(r => r.label === catalog.find(c => c.key === r.key)?.label))
  check('…and no QPR in any label', rows.every(r => !/QPR/.test(r.label)))

  // An individual exception changes it.
  const off = expected[0]
  await admin.from('role_overrides').insert({ user_id: ch.id, permission: off, is_enabled: false, updated_by: sa.id })
  check(`a Deny exception removes "${off}"`, !(await keys(ch)).includes(off))
  const notDefault = catalog.find(c => !c.restricted_to && !expected.includes(c.key))
  if (notDefault) {
    await admin.from('role_overrides').insert({ user_id: ch2.id, permission: notDefault.key, is_enabled: true, updated_by: sa.id })
    check(`an Allow exception adds "${notDefault.key}"`, (await keys(ch2)).includes(notDefault.key))
    // Delegation: ch borrows ch2's access while it is active.
    await admin.from('role_delegations').insert({
      delegator_id: ch2.id, delegate_id: ch.id, starts_at: new Date(Date.now() - 3600e3).toISOString(),
      ends_at: new Date(Date.now() + 3600e3).toISOString(), created_by: sa.id,
    })
    check('an active delegation adds the delegator’s access', (await keys(ch)).includes(notDefault.key))
  }

  // Super Admin: everything except keys that don't apply to them.
  const saKeys = await keys(sa)
  check('Super Admin sees catalog permissions (incl. Super-Admin-only ones)', catalog.filter(c => c.restricted_to === 'super_admin').every(c => saKeys.includes(c.key)))
  check('Super-Admin-only keys never appear for a Champion', catalog.filter(c => c.restricted_to === 'super_admin').every(c => !rows.some(r => r.key === c.key)))
})
