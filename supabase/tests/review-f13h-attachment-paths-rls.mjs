// Database tests for Review Finding 13h: a certificate's attachment can only
// be a file in its holder's own folder, and storage only serves a file through
// a certificate in the same holder's folder.
//
//   node supabase/tests/review-f13h-attachment-paths-rls.mjs   (from the project root)
//
// Needs migration 20261116000003. LOCAL SUPABASE ONLY (refuses otherwise).
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf13h')
const BUCKET = 'certification-files'
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const victim = await mkUser('victim', 'gatekeeper', A)
  const attacker = await mkUser('attacker', 'gatekeeper', A)
  const chB = await mkUser('chB', 'champion', B)
  const chA = await mkUser('chA', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)

  // The victim's own files: a self-reported photo, and an official attachment the server stored.
  const victimSelf = `self/${victim.id}/v1.png`
  const victimOfficial = `certificates/${victim.id}/v2.png`
  for (const p of [victimSelf, victimOfficial]) await admin.storage.from(BUCKET).upload(p, PNG, { contentType: 'image/png' })
  onCleanup(async () => {
    await admin.storage.from(BUCKET).remove([victimSelf, victimOfficial, `self/${attacker.id}/a1.png`])
    await admin.from('self_reported_certificates').delete().in('holder_id', [victim.id, attacker.id])
  })
  await admin.from('self_reported_certificates').insert({ holder_id: victim.id, name: 'First aid', organisation: 'Red Cross', achieved_on: '2026-01-01', attachment_path: victimSelf })

  const insertSelf = (who, path) => who.db.from('self_reported_certificates').insert({
    holder_id: who.id, name: 'Mine', organisation: 'Org', achieved_on: '2026-02-01', attachment_path: path,
  }).select('id').maybeSingle()

  // ── The database check ──
  for (const [label, path] of [
    ['another person’s self-reported file', victimSelf],
    ['another person’s official attachment', victimOfficial],
    ['a path climbing out of the folder', `self/${attacker.id}/../${victim.id}/v1.png`],
    ['a sub-folder', `self/${attacker.id}/x/y.png`],
    ['the wrong top folder', `designs/${attacker.id}/a.png`],
  ]) {
    const { error } = await insertSelf(attacker, path)
    check(`Gatekeeper: can’t attach ${label}`, !!error && /attachment_in_holder_folder|check/i.test(error.message), error?.message ?? 'saved')
  }
  await attacker.db.storage.from(BUCKET).upload(`self/${attacker.id}/a1.png`, PNG, { contentType: 'image/png' })
  const { data: own, error: ownErr } = await insertSelf(attacker, `self/${attacker.id}/a1.png`)
  check('Gatekeeper: can attach a file in their own folder', !ownErr && !!own, ownErr?.message)
  const { error: noFile } = await insertSelf(attacker, null)
  check('Gatekeeper: a certificate with no attachment is fine', !noFile, noFile?.message)
  if (own) {
    const { error: moveErr } = await attacker.db.from('self_reported_certificates').update({ attachment_path: victimSelf }).eq('id', own.id)
    const { data: after } = await admin.from('self_reported_certificates').select('attachment_path').eq('id', own.id).single()
    check('Gatekeeper: can’t change an attachment to someone else’s file', after.attachment_path !== victimSelf, moveErr?.message)
  }

  // Champions editing an official certificate through edit_certificate().
  const { data: type } = await admin.from('certification_types').select('id').limit(1).maybeSingle()
  if (type) {
    const { data: cert } = await admin.from('certificates').insert({ holder_id: attacker.id, type_id: type.id, achieved_on: '2026-03-01' }).select('id').single()
    onCleanup(async () => { await admin.from('certificates').delete().eq('id', cert.id) })
    const { error } = await chA.db.rpc('edit_certificate', {
      p_id: cert.id, p_achieved_on: null, p_format: null, p_attachment_path: victimOfficial, p_reissue: false, p_design_version: null, p_reason: 'test',
    })
    const { data: c } = await admin.from('certificates').select('attachment_path').eq('id', cert.id).single()
    check('Champion: edit_certificate can’t point an attachment at another person’s file', c.attachment_path !== victimOfficial, error?.message)
  } else check('Champion edit test skipped: no certification type in this database', true)

  // ── Storage: who can open the victim's file ──
  const canOpen = async (db, path) => !!(await db.storage.from(BUCKET).createSignedUrl(path, 60)).data?.signedUrl
  check('attacker (Gatekeeper, same club): can’t open the victim’s file', !(await canOpen(attacker.db, victimSelf)))
  check('Champion of another club: can’t open it', !(await canOpen(chB.db, victimSelf)))
  check('not signed in: can’t open it', !(await canOpen(newAnonClient(), victimSelf)))
  check('the victim: can open their own file', await canOpen(victim.db, victimSelf))
  check('Super Admin: can open it (sees every certificate)', await canOpen(sa.db, victimSelf))
  check('nobody can open a file no certificate uses', !(await canOpen(sa.db, victimOfficial)))
})
