// Database tests for Security Finding 6 — deleting resources and their files.
// Calls Supabase directly as each kind of user (what a forged request could
// do with no app code in the way).
//
//   node supabase/tests/resource-delete-storage-rls.mjs     (from the project root)
//
// Needs migrations 20261112000005 and 20261112000006.
import crypto from 'crypto'
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f6')
const BUCKET = 'resources'

await run(async () => {
  const A = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const ch = await mkUser('ch', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)

  const paths = [], resources = []
  onCleanup(async () => {
    if (resources.length) {
      await admin.from('resources').delete().in('id', resources)
    }
    if (paths.length) await admin.storage.from(BUCKET).remove(paths)
  })

  const { data: cat } = await admin.from('resource_categories').select('id').eq('is_active', true).limit(1).single()
  async function mkResource(title) {
    const path = `${crypto.randomUUID()}.pdf`
    paths.push(path)
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, new TextEncoder().encode('%PDF-1.4 zz'), { contentType: 'application/pdf' })
    if (upErr) throw upErr
    const { data, error } = await admin.from('resources').insert({
      title: `ZZ RLS f6 ${title}`, type: 'document', category_id: cat.id, publication_date: '2026-01-01', content_url: path,
      created_by: sa.id, status: 'published', visible_to_champions: true, visible_to_gatekeepers: true,
    }).select('id').single()
    if (error) throw error
    resources.push(data.id)
    return { id: data.id, path }
  }
  const fileExists = async path => ((await admin.storage.from(BUCKET).list('', { search: path })).data ?? []).some(f => f.name === path)
  const rowExists = async id => !!(await admin.from('resources').select('id').eq('id', id).maybeSingle()).data

  const r1 = await mkResource('one')
  check('baseline: Gatekeeper can read the resource and its file', !!(await gk.db.from('resources').select('id').eq('id', r1.id).maybeSingle()).data
    && !(await gk.db.storage.from(BUCKET).createSignedUrl(r1.path, 60)).error)

  // ── Storage: no client deletes files directly ──
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch], ['Super Admin', sa]]) {
    await who.db.storage.from(BUCKET).remove([r1.path])
    check(`${label}: can't delete a resource file directly from storage`, await fileExists(r1.path))
    const { error } = await who.db.storage.from(BUCKET).upload(r1.path, new TextEncoder().encode('overwritten'), { upsert: true, contentType: 'application/pdf' })
    check(`${label}: can't overwrite a resource file directly`, !!error)
  }

  // ── Table: no client hard-deletes a resource ──
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch], ['Super Admin', sa]]) {
    await who.db.from('resources').delete().eq('id', r1.id)
    check(`${label}: can't hard-delete a resource row`, await rowExists(r1.id))
  }
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch]]) {
    await who.db.from('resources').update({ deleted_at: new Date().toISOString() }).eq('id', r1.id)
    check(`${label}: can't soft-delete a resource`, !(await admin.from('resources').select('deleted_at').eq('id', r1.id).single()).data.deleted_at)
  }

  // ── Soft delete (what the server action does, as the Super Admin) ──
  const { error: directErr } = await sa.db.from('resources').update({ deleted_at: new Date().toISOString() }).eq('id', r1.id)
  check('Super Admin: can’t set deleted_at directly (only through soft_delete_resource)', !!directErr && !(await admin.from('resources').select('deleted_at').eq('id', r1.id).single()).data.deleted_at)
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch]]) {
    const { error } = await who.db.rpc('soft_delete_resource', { p_id: r1.id })
    check(`${label}: can't call soft_delete_resource`, !!error && !(await admin.from('resources').select('deleted_at').eq('id', r1.id).single()).data.deleted_at)
  }
  const { data: sdOk, error: sdErr } = await sa.db.rpc('soft_delete_resource', { p_id: r1.id })
  check('Super Admin: can soft-delete a resource', sdOk === true && !sdErr, sdErr?.message)
  const { data: delRow } = await admin.from('resources').select('deleted_by').eq('id', r1.id).single()
  check('soft delete records the real caller', delRow.deleted_by === sa.id)
  check('soft-deleted: the row is kept', await rowExists(r1.id))
  check('soft-deleted: the file is kept (only server code removes files)', await fileExists(r1.path))
  for (const [label, who] of [['Gatekeeper', gk], ['Champion', ch], ['Super Admin', sa]]) {
    check(`soft-deleted: hidden from ${label}`, !(await who.db.from('resources').select('id').eq('id', r1.id).maybeSingle()).data)
  }
  check('soft-deleted: Gatekeeper can no longer open its file', !!(await gk.db.storage.from(BUCKET).createSignedUrl(r1.path, 60)).error)
  const { data: audit } = await admin.from('audit_logs').select('actor_id').eq('entity_id', r1.id).eq('action', 'resource.deleted')
  check('soft delete is audited by the database with the real caller', audit?.some(a => a.actor_id === sa.id), JSON.stringify(audit))

  // ── Uploads still work through the server's one-time upload link ──
  const path2 = `${crypto.randomUUID()}.pdf`
  paths.push(path2)
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUploadUrl(path2)
  const { error: upErr } = await sa.db.storage.from(BUCKET).uploadToSignedUrl(path2, signed.token, new TextEncoder().encode('%PDF-1.4 new'), { contentType: 'application/pdf' })
  check('Super Admin: upload through a server-issued upload link still works', !upErr && await fileExists(path2), upErr?.message)
})
