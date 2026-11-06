// Database-rule tests for certifications — migration 20261103000000 (Epic 10, Phase 1).
// Not part of `npm test`: there is no local database, so this runs against the Supabase project in
// .env.local, as real signed-in test users calling Supabase directly (no app code). It creates
// throwaway "ZZ RLS" clubs, users, a test certification type and certificates, prints PASS/FAIL per
// check, and always deletes everything it created. It never changes real people's certificates.
//
//   node supabase/tests/certifications-rls.mjs     (from the project root)
import { createRequire } from 'module'
import fs from 'fs'
import crypto from 'crypto'
const require = createRequire(`${process.cwd()}/package.json`)
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`) }
const refused = r => !!r.error || (Array.isArray(r.data) && r.data.length === 0)

const PREFIX = 'zz-rls-cert-'
const created = { users: [], clubs: [], types: [], groups: [] }
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)   // Sri Lanka date
const addYears = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y + n, m - 1, dd)).toISOString().slice(0, 10) }

async function mkClub(name) {
  const { data, error } = await admin.from('clubs').insert({ name: `ZZ RLS ${name}`, club_code: `ZZRC-${name}`, location: 'Test', is_active: true }).select('id').single()
  if (error) throw error
  created.clubs.push(data.id)
  return data.id
}
let phone = 0
async function mkUser(tag, role, clubId) {
  const email = `${PREFIX}${tag}@example.com`
  const password = 'Zz!' + crypto.randomBytes(9).toString('base64url') + '9a'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  created.users.push(data.user.id)
  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id, full_name: `ZZ RLS ${tag}`, email, role, club_id: clubId, is_active: true,
    must_change_password: false, phone: `+9477929${String(phone++).padStart(4, '0')}`,
  })
  if (pErr) throw pErr
  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  return { id: data.user.id, db: client }
}
const status = async (who, id) => (await who.db.from('certificate_statuses').select('status, expires_on, certificate_number, stopped_on').eq('id', id).maybeSingle()).data
const notes = async (who, kind) => ((await who.db.from('notifications').select('kind, body').eq('kind', kind)).data ?? [])

async function main() {
  // ── Migration (read-only checks against real data) ──
  const { data: qpr } = await admin.from('certification_types').select('*').eq('code', 'QPR').single()
  check('QPR type exists, 3 years, marked as created from existing data', qpr?.validity_value === 3 && qpr?.validity_unit === 'years' && qpr?.created_from_existing === true)
  const { data: legacy } = await admin.from('profiles').select('id, qpr_certification_date, qpr_expiry_date').not('qpr_certification_date', 'is', null).not('email', 'ilike', 'zz-%')
  const { data: migrated } = await admin.from('certificates').select('holder_id, achieved_on, expires_on').eq('type_id', qpr.id).eq('migrated', true)
  const byHolder = Object.fromEntries(migrated.map(c => [c.holder_id, c]))
  const mismatched = legacy.filter(p => !byHolder[p.id] || byHolder[p.id].achieved_on !== p.qpr_certification_date || byHolder[p.id].expires_on !== p.qpr_expiry_date)
  check(`Every one of the ${legacy.length} existing QPR dates became a matching certificate`, legacy.length > 0 && mismatched.length === 0, `${mismatched.length} mismatched`)
  const { data: stats } = await admin.rpc('qpr_certification_stats')
  const validNow = legacy.filter(p => p.qpr_expiry_date >= today).length
  check(`Mobile "Certified" count unchanged (${validNow} valid)`, stats?.[0]?.total_certified >= validNow)
  const { data: cat } = await admin.from('permission_catalog').select('key, restricted_to').eq('category', 'Certifications')
  check('14 certification permission keys, 3 of them Super Admins only', cat.length === 14 && cat.filter(k => k.restricted_to === 'super_admin').length === 3)
  const { data: defs } = await admin.from('permissions').select('role, permission, is_enabled').like('permission', 'certifications.%')
  const on = r => defs.filter(d => d.role === r && d.is_enabled).map(d => d.permission.replace('certifications.', '')).sort().join(',')
  check('Champion defaults: everything except the 3 Super-Admin-only keys', defs.filter(d => d.role === 'champion').length === 14
    && on('champion') === 'attachments.manage,award,digital.generate,journey.view,official.edit,official.remove,review.remove,review.verify,review.view,self.manage,types.view', on('champion'))
  check('Gatekeeper defaults: only adding their own', defs.filter(d => d.role === 'gatekeeper').length === 14 && on('gatekeeper') === 'self.manage', on('gatekeeper'))

  // ── People ──
  const A = await mkClub('A'), B = await mkClub('B')
  const sa = await mkUser('sa', 'super_admin', null)
  const chA = await mkUser('champ-a', 'champion', A)
  const chB = await mkUser('champ-b', 'champion', B)
  const gkA1 = await mkUser('gk-a1', 'gatekeeper', A)
  const gkA2 = await mkUser('gk-a2', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)

  // ── Types (Story 10.1) ──
  const t1 = await sa.db.from('certification_types').insert({ name: 'ZZ RLS First Aid', code: 'zzfa', validity_value: 2, validity_unit: 'years', offered_from: '2025-01-01' }).select('id, code').single()
  check('Super Admin creates a type; code stored in capitals', !t1.error && t1.data?.code === 'ZZFA', t1.error?.message)
  const T = t1.data.id; created.types.push(T)
  check('Champion cannot create a type', refused(await chA.db.from('certification_types').insert({ name: 'ZZ RLS Nope', code: 'ZZNO', offered_from: '2025-01-01' }).select()))
  check('Duplicate code (other capitals) is refused', !!(await sa.db.from('certification_types').insert({ name: 'ZZ RLS Other', code: 'ZzFa', offered_from: '2025-01-01' })).error)

  // ── Award (Story 10.5) ──
  const a1 = await chA.db.from('certificates').insert({ holder_id: gkA1.id, type_id: T, achieved_on: '2025-06-01' }).select('id, expires_on, added_by').single()
  check('Champion adds a certificate to their own club’s Gatekeeper; expiry calculated', !a1.error && a1.data?.expires_on === '2027-06-01' && a1.data?.added_by === chA.id, a1.error?.message)
  const C1 = a1.data.id
  check('Champion cannot add to another club’s Gatekeeper', refused(await chA.db.from('certificates').insert({ holder_id: gkB.id, type_id: T, achieved_on: '2025-06-01' }).select()))
  check('Champion cannot add to themselves', refused(await chA.db.from('certificates').insert({ holder_id: chA.id, type_id: T, achieved_on: '2025-06-01' }).select()))
  check('Champion cannot add to another Champion', refused(await chA.db.from('certificates').insert({ holder_id: chB.id, type_id: T, achieved_on: '2025-06-01' }).select()))
  check('Gatekeeper cannot add an official certificate to themselves', refused(await gkA1.db.from('certificates').insert({ holder_id: gkA1.id, type_id: T, achieved_on: '2025-06-01' }).select()))
  check('A future date is refused', !!(await chA.db.from('certificates').insert({ holder_id: gkA2.id, type_id: T, achieved_on: addYears(today, 1) })).error)
  check('A date before the type was offered is refused', !!(await chA.db.from('certificates').insert({ holder_id: gkA2.id, type_id: T, achieved_on: '2024-12-31' })).error)
  const sab = await sa.db.from('certificates').insert({ holder_id: chB.id, type_id: T, achieved_on: '2025-03-01' }).select('id').single()
  check('Super Admin adds a certificate to a Champion', !sab.error, sab.error?.message)

  // ── Who can see it ──
  check('Holder sees their own certificate as valid', (await status(gkA1, C1))?.status === 'valid')
  check('Another Gatekeeper in the club cannot see it', !(await status(gkA2, C1)))
  check('Another club’s Champion cannot see it', !(await status(chB, C1)))
  check('Their Champion can see it', !!(await status(chA, C1)))

  // ── Edit (Story 10.6) ──
  check('Edit without a reason is refused', !!(await chA.db.rpc('edit_certificate', { p_id: C1, p_achieved_on: '2025-06-10', p_format: null, p_attachment_path: null, p_reissue: false, p_design_version: null, p_reason: '' })).error)
  check('Direct update without the reason is refused', !!(await chA.db.from('certificates').update({ achieved_on: '2025-06-10' }).eq('id', C1)).error)
  const e1 = await chA.db.rpc('edit_certificate', { p_id: C1, p_achieved_on: '2025-06-10', p_format: 'both', p_attachment_path: null, p_reissue: false, p_design_version: null, p_reason: 'Date was entered wrongly' })
  check('Edit with a reason recalculates the expiry', !e1.error && (await status(chA, C1))?.expires_on === '2027-06-10', e1.error?.message)
  check('Nothing-changed edit is refused', !!(await chA.db.rpc('edit_certificate', { p_id: C1, p_achieved_on: '2025-06-10', p_format: 'both', p_attachment_path: null, p_reissue: false, p_design_version: null, p_reason: 'again' })).error)
  const { data: ev } = await gkA1.db.from('certificate_events').select('kind, reason, actor_label').eq('certificate_id', C1)
  check('Holder sees the edit in their journey, with the reason', ev?.some(e => e.kind === 'edited' && e.reason === 'Date was entered wrongly'))
  check('Holder was notified of the edit', (await notes(gkA1, 'certificate_edited')).some(n => n.body.includes('Date was entered wrongly')))
  check('Other club’s Champion cannot edit', !!(await chB.db.rpc('edit_certificate', { p_id: C1, p_achieved_on: '2025-06-11', p_format: null, p_attachment_path: null, p_reissue: false, p_design_version: null, p_reason: 'x' })).error)

  // ── Renew (Story 10.7) ──
  const r1 = await chA.db.from('certificates').insert({ holder_id: gkA1.id, type_id: T, achieved_on: '2026-10-01' }).select('id').single()
  check('Renewal: old certificate shows as Renewed, new one Valid', !r1.error && (await status(gkA1, C1))?.status === 'renewed' && (await status(gkA1, r1.data.id))?.status === 'valid', r1.error?.message)
  check('Holder was notified of the renewal', (await notes(gkA1, 'certificate_renewed')).length === 1)

  // ── Remove and undo (Story 10.8) ──
  check('Removal with a too-short reason is refused', !!(await chA.db.rpc('remove_certificate', { p_id: r1.data.id, p_category: 'Added by mistake', p_reason: 'short' })).error)
  check('Removal with an unknown category is refused', !!(await chA.db.rpc('remove_certificate', { p_id: r1.data.id, p_category: 'Because', p_reason: 'a long enough reason' })).error)
  const rm = await chA.db.rpc('remove_certificate', { p_id: r1.data.id, p_category: 'Training was not completed', p_reason: 'The renewal session was cancelled.' })
  check('Champion removes with a valid reason; previous certificate becomes current', !rm.error && (await status(gkA1, r1.data.id))?.status === 'removed' && (await status(gkA1, C1))?.status === 'valid', rm.error?.message)
  check('Holder was notified of the removal', (await notes(gkA1, 'certificate_removed')).length === 1)
  check('Champion who removed it is not notified', (await notes(chA, 'certificate_removed')).length === 0)
  check('A removed certificate cannot be edited', !!(await chA.db.rpc('edit_certificate', { p_id: r1.data.id, p_achieved_on: '2026-10-02', p_format: null, p_attachment_path: null, p_reissue: false, p_design_version: null, p_reason: 'x' })).error)
  check('Champion cannot undo a removal', !!(await chA.db.rpc('restore_certificate', { p_id: r1.data.id })).error)
  const rs = await sa.db.rpc('restore_certificate', { p_id: r1.data.id })
  check('Super Admin undoes it; Champion is notified', !rs.error && (await status(gkA1, r1.data.id))?.status === 'valid' && (await notes(chA, 'certificate_restored')).length === 1, rs.error?.message)
  await sa.db.rpc('remove_certificate', { p_id: r1.data.id, p_category: 'Duplicate record', p_reason: 'Entered twice by mistake.' })
  check('When a Super Admin removes, the club’s Champion is notified', (await notes(chA, 'certificate_removed')).length === 1)

  // ── Old QPR form ↔ certificates (Story 10.17 Sc04) ──
  const up1 = await chA.db.from('profiles').update({ qpr_certification_date: '2025-03-01' }).eq('id', gkA2.id).select('id')
  const q1 = (await admin.from('certificates').select('id, achieved_on, expires_on, removed_at').eq('holder_id', gkA2.id).eq('type_id', qpr.id)).data
  check('Old form: setting a QPR date creates a QPR certificate', !up1.error && q1?.length === 1 && q1[0].achieved_on === '2025-03-01' && q1[0].expires_on === '2028-03-01', up1.error?.message ?? JSON.stringify(q1))
  await chA.db.from('profiles').update({ qpr_certification_date: '2025-04-01' }).eq('id', gkA2.id)
  const q2 = (await admin.from('certificates').select('achieved_on').eq('id', q1[0].id).single()).data
  check('Old form: changing the date corrects that certificate', q2?.achieved_on === '2025-04-01')
  const nq = await chA.db.from('certificates').insert({ holder_id: gkA2.id, type_id: qpr.id, achieved_on: today }).select('id').single()
  const p2 = (await admin.from('profiles').select('qpr_certification_date, qpr_expiry_date').eq('id', gkA2.id).single()).data
  check('New QPR certificate updates the old QPR fields', !nq.error && p2.qpr_certification_date === today && p2.qpr_expiry_date === addYears(today, 3), nq.error?.message ?? JSON.stringify(p2))
  await chA.db.rpc('remove_certificate', { p_id: nq.data.id, p_category: 'Added by mistake', p_reason: 'Testing removal sync.' })
  const p3 = (await admin.from('profiles').select('qpr_certification_date').eq('id', gkA2.id).single()).data
  check('Removing it puts the old fields back to the previous QPR certificate', p3.qpr_certification_date === '2025-04-01')
  await chA.db.from('profiles').update({ qpr_certification_date: null }).eq('id', gkA2.id)
  const q3 = (await admin.from('certificates').select('removed_at').eq('id', q1[0].id).single()).data
  check('Old form: clearing the date removes that certificate', !!q3?.removed_at)

  // ── Designs and numbering (Stories 10.3, 10.5 Sc04) ──
  const d1 = await sa.db.from('certification_designs').insert({ type_id: T, version: 99, design: { items: [] } }).select('version').single()
  const d2 = await sa.db.from('certification_designs').insert({ type_id: T, version: 1, design: { items: [] } }).select('version').single()
  check('Design versions are numbered 1, 2 regardless of what is sent', d1.data?.version === 1 && d2.data?.version === 2, d1.error?.message ?? d2.error?.message)
  check('A saved version cannot be changed', refused(await sa.db.from('certification_designs').update({ design: { x: 1 } }).eq('type_id', T).eq('version', 1).select()))
  check('Champion cannot save a design', refused(await chA.db.from('certification_designs').insert({ type_id: T, version: 1, design: {} }).select()))
  const n1 = await chA.db.from('certificates').insert({ holder_id: gkA2.id, type_id: T, achieved_on: '2026-02-02', format: 'digital', design_version: 2, certificate_number: 'HMM-FAKE-2026-999999' }).select('certificate_number').single()
  check('Digital certificate gets the next number for its type and year', n1.data?.certificate_number === 'HMM-ZZFA-2026-000001', n1.error?.message ?? n1.data?.certificate_number)

  // ── Retire and reactivate (Story 10.2) ──
  check('Champion cannot retire a type', refused(await chA.db.from('certification_type_retirements').insert({ type_id: T, retire_on: today, option: 'stop' }).select()))
  check('A retirement date in the past is refused', !!(await sa.db.from('certification_type_retirements').insert({ type_id: T, retire_on: '2020-01-01', option: 'stop' })).error)
  const ret = await sa.db.from('certification_type_retirements').insert({ type_id: T, retire_on: today, option: 'stop' }).select('id').single()
  check('Retired with "stop": existing certificates show as Stopped', !ret.error && (await status(gkA1, C1))?.status === 'stopped', ret.error?.message)
  check('A retired type cannot be awarded', !!(await sa.db.from('certificates').insert({ holder_id: gkA1.id, type_id: T, achieved_on: today })).error)
  check('A retired type’s design cannot be edited', !!(await sa.db.from('certification_designs').insert({ type_id: T, version: 3, design: {} })).error)
  // Pretend the retirement took effect months ago (only the system may move a date that is already in effect),
  // then reactivate today. Retiring and reactivating on the same day would count as cancelling it.
  await admin.from('certification_type_retirements').update({ retire_on: '2026-06-01' }).eq('id', ret.data.id)
  const re = await sa.db.from('certification_type_retirements').update({ reactivated_on: today }).eq('id', ret.data.id).select('id')
  const aw = await chA.db.from('certificates').insert({ holder_id: gkA1.id, type_id: T, achieved_on: today }).select('id').single()
  check('After reactivation the type can be awarded again', !re.error && !aw.error, re.error?.message ?? aw.error?.message)
  check('After reactivation, certificates stopped by the retirement stay stopped', (await status(gkA1, C1))?.stopped_on === '2026-06-01', JSON.stringify(await status(gkA1, C1)))
  check('The certificate awarded after reactivation is valid', (await status(gkA1, aw.data?.id))?.status === 'valid')
  const { data: ts } = await sa.db.from('certification_type_statuses').select('status').eq('id', T).single()
  check('Type status shows Active again', ts?.status === 'active')

  // ── Permissions (Story 10.15) ──
  check('Super-Admin-only key cannot be switched on for Champions by role default', refused(await sa.db.from('permissions').update({ is_enabled: true }).eq('role', 'champion').eq('permission', 'certifications.types.manage').select()))
  check('…nor by an individual exception', !!(await sa.db.from('role_overrides').insert({ user_id: chA.id, permission: 'certifications.types.manage', is_enabled: true, updated_by: sa.id })).error)
  const { data: grp } = await sa.db.from('permission_groups').insert({ name: 'ZZ RLS cert group', created_by: sa.id }).select('id').single()
  if (grp) created.groups.push(grp.id)
  check('…nor by a permission group', !!(await sa.db.from('group_permissions').insert({ group_id: grp?.id, permission: 'certifications.design.manage', is_enabled: true, updated_by: sa.id })).error)
  await sa.db.from('role_overrides').insert({ user_id: chB.id, permission: 'certifications.award', is_enabled: false, updated_by: sa.id })
  check('An individual exception switching off "award" stops that Champion', refused(await chB.db.from('certificates').insert({ holder_id: gkB.id, type_id: T, achieved_on: today }).select()))
  const now = new Date()
  const dl = await sa.db.from('role_delegations').insert({ delegator_id: chA.id, delegate_id: chB.id, starts_at: new Date(now - 60e3).toISOString(), ends_at: new Date(+now + 3600e3).toISOString(), created_by: sa.id })
  const bw = await chB.db.from('certificates').insert({ holder_id: gkB.id, type_id: T, achieved_on: today }).select('id').single()
  check('A delegate borrows "award" from an active delegation (own club only)', !dl.error && !bw.error, dl.error?.message ?? bw.error?.message)

  // ── Self-reported and reviews (Stories 10.9, 10.10) ──
  const s1 = await gkA1.db.from('self_reported_certificates').insert({ holder_id: gkA1.id, name: 'ZZ RLS Webinar', organisation: 'WHO', achieved_on: '2025-09-18', state: 'verified' }).select('id, state').single()
  check('Gatekeeper adds their own; it starts as not verified', !s1.error && s1.data?.state === 'unverified', s1.error?.message)
  check('Gatekeeper cannot add one for someone else', refused(await gkA1.db.from('self_reported_certificates').insert({ holder_id: gkA2.id, name: 'x', organisation: 'y', achieved_on: '2025-01-01' }).select()))
  check('Holder cannot verify their own', !!(await gkA1.db.from('self_reported_certificates').update({ state: 'verified' }).eq('id', s1.data.id)).error)
  check('Other club’s Champion cannot see it', !(await chB.db.from('self_reported_certificates').select('id').eq('id', s1.data.id).maybeSingle()).data)
  const v1 = await chA.db.rpc('review_self_reported', { p_id: s1.data.id, p_verify: true, p_category: null, p_reason: null })
  check('Their Champion verifies it; holder is notified', !v1.error && (await notes(gkA1, 'self_reported_verified')).length === 1, v1.error?.message)
  check('Holder cannot edit it once verified', !!(await gkA1.db.from('self_reported_certificates').update({ name: 'Changed' }).eq('id', s1.data.id)).error)
  const s2 = await gkA1.db.from('self_reported_certificates').insert({ holder_id: gkA1.id, name: 'ZZ RLS Camp', organisation: 'Rotaract', achieved_on: '2026-01-15' }).select('id').single()
  const w = await gkA1.db.from('self_reported_certificates').update({ state: 'withdrawn' }).eq('id', s2.data.id).select('state')
  check('Holder withdraws one; their Champion can no longer see it', !w.error && !(await chA.db.from('self_reported_certificates').select('id').eq('id', s2.data.id).maybeSingle()).data, w.error?.message)
  const s3 = await chA.db.from('self_reported_certificates').insert({ holder_id: chA.id, name: 'ZZ RLS MHFA', organisation: 'MHFA', achieved_on: '2025-07-01' }).select('id').single()
  check('Champion adds their own; Super Admin can see it', !s3.error && !!(await sa.db.from('self_reported_certificates').select('id').eq('id', s3.data.id).maybeSingle()).data, s3.error?.message)
  check('Champion cannot review their own', !!(await chA.db.rpc('review_self_reported', { p_id: s3.data.id, p_verify: true, p_category: null, p_reason: null })).error)
  const rv = await sa.db.rpc('review_self_reported', { p_id: s3.data.id, p_verify: false, p_category: 'Not a recognised certification', p_reason: 'Not on the accepted list.' })
  check('Super Admin removes it with a reason; Champion is notified', !rv.error && (await notes(chA, 'self_reported_removed')).length === 1, rv.error?.message)

  // ── Notifications and audit (Stories 10.14, 10.16) ──
  const mine = (await gkA1.db.from('notifications').select('id')).data ?? []
  check('Nobody can read someone else’s notifications', ((await gkA2.db.from('notifications').select('id').in('id', mine.map(n => n.id))).data ?? []).length === 0)
  check('A notification’s text cannot be changed', !!(await gkA1.db.from('notifications').update({ body: 'hacked' }).eq('id', mine[0]?.id)).error)
  check('Recipient can mark it read', !(await gkA1.db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine[0]?.id)).error)
  const { data: au } = await sa.db.from('audit_logs').select('action').like('action', 'certification.%').in('entity_id', [T, C1, r1.data.id, s1.data.id])
  const acts = new Set(au?.map(a => a.action))
  check('Audit history has type, add, edit, remove, undo, design, retire, reactivate and review entries',
    ['type_created', 'certificate_added', 'certificate_edited', 'certificate_renewed', 'certificate_removed', 'removal_undone', 'design_saved', 'type_retired', 'type_reactivated', 'self_reported_verified'].every(a => acts.has('certification.' + a)), [...acts].join(', '))
  check('Champions cannot read the audit history', ((await chA.db.from('audit_logs').select('id').like('action', 'certification.%')).data ?? []).length === 0)
}

async function cleanup() {
  const users = [...created.users]
  if (created.types.length) {
    await admin.from('certificates').delete().in('type_id', created.types)
    await admin.from('certification_designs').delete().in('type_id', created.types)
    await admin.from('certification_type_retirements').delete().in('type_id', created.types)
    await admin.from('certificate_number_counters').delete().in('type_id', created.types)
  }
  if (users.length) {
    const { data: certs } = await admin.from('certificates').select('id').in('holder_id', users)
    const certIds = (certs ?? []).map(c => c.id)
    const { data: selfs } = await admin.from('self_reported_certificates').select('id').in('holder_id', users)
    const entityIds = [...created.types, ...certIds, ...(selfs ?? []).map(s => s.id), ...users]
    if (entityIds.length) await admin.from('audit_logs').delete().in('entity_id', entityIds)
    await admin.from('audit_logs').delete().in('actor_id', users)
    await admin.from('role_delegations').delete().in('delegator_id', users)
    await admin.from('password_history').delete().in('user_id', users)
  }
  if (created.groups.length) await admin.from('permission_groups').delete().in('id', created.groups)
  if (created.types.length) { await admin.from('audit_logs').delete().in('entity_id', created.types); await admin.from('certification_types').delete().in('id', created.types) }
  for (const id of users) await admin.auth.admin.deleteUser(id)
  if (users.length) await admin.from('profiles').delete().in('id', users)        // cascades certificates, self-reported, notifications
  if (created.clubs.length) await admin.from('clubs').delete().in('id', created.clubs)
  const { count: u } = await admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', `${PREFIX}%`)
  const { count: c } = await admin.from('clubs').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ RLS %')
  const { count: t } = await admin.from('certification_types').select('id', { count: 'exact', head: true }).ilike('name', 'ZZ RLS%')
  console.log(`cleanup: deleted ${users.length} users, ${created.clubs.length} clubs, ${created.types.length} types; left: users ${u}, clubs ${c}, types ${t}`)
}

try { await main() } catch (err) { fail++; console.log('ERROR', err.message ?? err) } finally {
  await cleanup()
  console.log(`\n${pass} passed, ${fail} failed`)
}
