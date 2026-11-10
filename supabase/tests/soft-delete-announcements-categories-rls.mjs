// Database tests for soft-deleting announcements and resource categories
// (decision 3, after Security Finding 6).
//
//   node supabase/tests/soft-delete-announcements-categories-rls.mjs     (from the project root)
//
// Needs migration 20261112000008.
import crypto from 'crypto'
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('sd')

await run(async () => {
  const A = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const ch = await mkUser('ch', 'champion', A)
  const ch2 = await mkUser('ch2', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)
  const anns = [], cats = []
  onCleanup(async () => {
    await admin.from('announcement_clubs').delete().in('announcement_id', anns)
    await admin.from('announcements').delete().in('id', anns)
    await admin.from('resource_categories').delete().in('id', cats)
  })

  async function mkAnn(by, title) {
    const { data, error } = await admin.from('announcements').insert({
      title: `ZZ RLS sd ${title}`, body: 'x', status: 'published', audience: 'all', is_all_clubs: false, created_by: by,
      publish_date: new Date(Date.now() - 864e5).toISOString(),
    }).select('id').single()
    if (error) throw error
    anns.push(data.id)
    return data.id
  }
  const visibleTo = async (who, id) => !!(await who.db.from('announcements').select('id').eq('id', id).maybeSingle()).data
  const annRow = async id => (await admin.from('announcements').select('deleted_at, deleted_by').eq('id', id).single()).data

  // ── Announcements ──
  const a1 = await mkAnn(sa.id, 'by admin')
  check('baseline: Gatekeeper sees the announcement', await visibleTo(gk, a1))
  await sa.db.from('announcements').delete().eq('id', a1)
  check('nobody can hard-delete an announcement (even a Super Admin)', !!(await admin.from('announcements').select('id').eq('id', a1).maybeSingle()).data)
  const { error: directErr } = await sa.db.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', a1)
  check('deleted_at can’t be set directly', !!directErr && !(await annRow(a1)).deleted_at)
  const { error: gkErr } = await gk.db.rpc('soft_delete_announcement', { p_id: a1 })
  check('Gatekeeper can’t delete an announcement', !!gkErr && !(await annRow(a1)).deleted_at)
  const { error: chOtherErr } = await ch.db.rpc('soft_delete_announcement', { p_id: a1 })
  check('Champion can’t delete someone else’s announcement', !!chOtherErr && !(await annRow(a1)).deleted_at)
  const { data: ok1, error: saErr } = await sa.db.rpc('soft_delete_announcement', { p_id: a1 })
  check('Super Admin soft-deletes it', ok1 === true && !saErr, saErr?.message)
  check('…the real caller is recorded', (await annRow(a1)).deleted_by === sa.id)
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch], ['Super Admin', sa]]) check(`…hidden from ${label}`, !(await visibleTo(who, a1)))
  const { data: labels } = await gk.db.rpc('announcement_source_labels', { p_announcement_ids: [a1] })
  check('…and from the side routes (labels)', (labels ?? []).length === 0)
  const { data: audit } = await admin.from('audit_logs').select('actor_id').eq('entity_id', a1).eq('action', 'announcement.deleted')
  check('…audited by the database', audit?.some(r => r.actor_id === sa.id))

  const a2 = await mkAnn(ch.id, 'by champion')
  const { error: noPerm } = await ch.db.rpc('soft_delete_announcement', { p_id: a2 })
  const { data: perm } = await ch.db.rpc('cert_can', { p_permission: 'delete_announcements' })
  if (perm === true) {
    check('Champion with delete permission can delete their own', !noPerm && !!(await annRow(a2)).deleted_at, noPerm?.message)
  } else {
    check('Champion without delete permission can’t delete even their own', !!noPerm && !(await annRow(a2)).deleted_at)
  }
  const { error: ch2Err } = await ch2.db.rpc('soft_delete_announcement', { p_id: a2 })
  check('another Champion can’t delete it', !!ch2Err || !!(await annRow(a2)).deleted_at)

  // ── Categories ──
  const name = `ZZ RLS sd cat ${crypto.randomBytes(3).toString('hex')}`
  const { data: cat, error: catErr } = await sa.db.from('resource_categories').insert({ name }).select('id').single()
  if (catErr) throw catErr
  cats.push(cat.id)
  await sa.db.from('resource_categories').delete().eq('id', cat.id)
  check('nobody can hard-delete a category', !!(await admin.from('resource_categories').select('id').eq('id', cat.id).maybeSingle()).data)
  const { error: chCat } = await ch.db.rpc('soft_delete_resource_category', { p_id: cat.id })
  check('Champion can’t delete a category', !!chCat)
  const { data: catOk, error: catDelErr } = await sa.db.rpc('soft_delete_resource_category', { p_id: cat.id })
  check('Super Admin soft-deletes an unused category', catOk === true && !catDelErr, catDelErr?.message)
  check('…hidden from everyone', !(await sa.db.from('resource_categories').select('id').eq('id', cat.id).maybeSingle()).data)
  const { data: again, error: againErr } = await sa.db.from('resource_categories').insert({ name }).select('id').single()
  if (again) cats.push(again.id)
  check('…and its name can be used again', !!again && !againErr, againErr?.message)
})
