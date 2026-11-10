// Database-rule tests for managed resource categories (sheet row 26) —
// migration 20261110000000. Run after the migration is applied:
//
//   node supabase/tests/resource-categories-rls.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('cat')

await run(async () => {
  const club = await mkClub('A')
  const sa = await mkUser('sa', 'super_admin', null)
  const champ = await mkUser('champ', 'champion', club)
  const gk = await mkUser('gk', 'gatekeeper', club)
  const catIds = [], resIds = []
  onCleanup(async () => {
    if (resIds.length) await admin.from('resources').delete().in('id', resIds)
    if (catIds.length) {
      await admin.from('resource_categories').delete().in('id', catIds)
    }
  })

  // Existing data was migrated.
  const { count: unlinked } = await admin.from('resources').select('id', { count: 'exact', head: true }).not('category', 'is', null).is('category_id', null)
  check('every existing resource with a category is linked to a category row', unlinked === 0, `${unlinked} unlinked`)
  const { data: catalog } = await admin.from('permission_catalog').select('restricted_to').eq('key', 'manage_resource_categories').maybeSingle()
  check('permission key manage_resource_categories exists (Super-Admin-only)', catalog?.restricted_to === 'super_admin')

  // Who can manage.
  const byChamp = await champ.db.from('resource_categories').insert({ name: 'ZZ RLS champ cat' }).select('id')
  check('Champion cannot create a category', !!byChamp.error || !byChamp.data?.length)
  const byGk = await gk.db.from('resource_categories').insert({ name: 'ZZ RLS gk cat' }).select('id')
  check('Gatekeeper cannot create a category', !!byGk.error || !byGk.data?.length)
  const { data: made, error: mErr } = await sa.db.from('resource_categories').insert({ name: 'ZZ RLS Cat One' }).select('id').single()
  check('Super Admin creates a category', !mErr && !!made, mErr?.message)
  if (made) catIds.push(made.id)
  const dup = await sa.db.from('resource_categories').insert({ name: '  zz rls cat one ' }).select('id')
  check('duplicate name (any capitals/spaces) is refused', dup.error?.code === '23505', dup.error?.message)
  const readByGk = await gk.db.from('resource_categories').select('id').eq('id', made.id)
  check('Gatekeeper can read categories', (readByGk.data ?? []).length === 1)
  const renameByChamp = await champ.db.from('resource_categories').update({ name: 'hacked' }).eq('id', made.id).select('id')
  check('Champion cannot rename a category', !!renameByChamp.error || !renameByChamp.data?.length)

  // Linking resources.
  const { data: res, error: rErr } = await sa.db.from('resources').insert({
    title: 'ZZ RLS res', type: 'article', content_text: 'x', publication_date: '2026-01-01', created_by: sa.id, category_id: made.id,
  }).select('id, category').single()
  if (res) resIds.push(res.id)
  check('a resource gets the category name filled in', !rErr && res?.category === 'ZZ RLS Cat One', rErr?.message)

  await sa.db.from('resource_categories').update({ name: 'ZZ RLS Cat Renamed' }).eq('id', made.id)
  const { data: after } = await admin.from('resources').select('category').eq('id', res.id).single()
  check('renaming updates linked resources', after?.category === 'ZZ RLS Cat Renamed', after?.category)

  const del = await sa.db.rpc('soft_delete_resource_category', { p_id: made.id })
  check('a category in use cannot be deleted', !!del.error, 'delete succeeded')
  check('…with a plain-English message', /can't be deleted\. Deactivate it instead/.test(del.error?.message ?? ''), del.error?.message)

  const deact = await sa.db.from('resource_categories').update({ is_active: false }).eq('id', made.id).select('id')
  check('Super Admin deactivates a category', !deact.error && deact.data?.length === 1, deact.error?.message)
  const keep = await sa.db.from('resources').update({ title: 'ZZ RLS res edited' }).eq('id', res.id).select('id')
  check('a resource keeps its now-deactivated category on edit', !keep.error && keep.data?.length === 1, keep.error?.message)
  const { data: res2, error: r2Err } = await sa.db.from('resources').insert({
    title: 'ZZ RLS res 2', type: 'article', content_text: 'x', publication_date: '2026-01-01', created_by: sa.id, category_id: made.id,
  }).select('id').maybeSingle()
  if (res2) resIds.push(res2.id)
  check('a new resource cannot use a deactivated category', !!r2Err && /deactivated/.test(r2Err.message), r2Err?.message ?? 'insert succeeded')

  const { data: logs } = await admin.from('audit_logs').select('action, actor_id').eq('entity_id', made.id).order('created_at')
  const actions = (logs ?? []).map(l => l.action)
  check('audit log: created, renamed, deactivated (by the Super Admin)',
    ['resource_category.created', 'resource_category.renamed', 'resource_category.deactivated'].every(a => actions.includes(a)) && logs.every(l => l.actor_id === sa.id),
    actions.join(', '))

  const { data: unused } = await sa.db.from('resource_categories').insert({ name: 'ZZ RLS Unused' }).select('id').single()
  catIds.push(unused.id)
  const delUnused = await sa.db.rpc('soft_delete_resource_category', { p_id: unused.id })
  check('an unused category can be deleted (soft delete)', delUnused.data === true && !delUnused.error, delUnused.error?.message)
})
