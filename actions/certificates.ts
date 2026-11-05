'use server'

// Official certificates on profiles (Epic 10, Stories 10.5–10.8, 10.10).
// Rows are written with the signed-in user's own client, so the database's
// rules (cert_can, cert_in_scope, triggers) decide what is allowed and who is
// notified. Attachments go into the private 'certification-files' bucket via
// the admin client, but only after the database has said this user may add
// or edit that person's certificates; a failed save deletes the file again.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayDateString } from '@/lib/org-date'
import { TYPE_COLUMNS, formatCertDate, type CertificationTypeRow } from '@/lib/certification-types'
import { currentDesignVersions, issueCertificatePdf } from '@/lib/certificate-issue.server'
import { ATTACHMENT_CONTENT_TYPES, attachmentContentError, checkAttachment, describeCertError, validateAward, validateRemoval, type CertificateFormat } from '@/lib/certificates'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CertActionState = { error?: string; success?: boolean; message?: string } | null

const BUCKET = 'certification-files'
const str = (formData: FormData, key: string) => ((formData.get(key) as string | null) ?? '').trim()
const UUID_RE = /^[0-9a-f-]{36}$/i

function revalidateProfiles() {
  // Certificates show on several profile pages and lists; refresh them all.
  revalidatePath('/super-admin/gatekeepers', 'layout')
  revalidatePath('/super-admin/champions', 'layout')
  revalidatePath('/champion/gatekeepers', 'layout')
  revalidatePath('/super-admin/certifications', 'layout')
}

async function can(supabase: ServerClient, permission: string, holderId: string): Promise<boolean> {
  const [{ data: ok }, { data: inScope }] = await Promise.all([
    supabase.rpc('cert_can', { p_permission: permission }),
    supabase.rpc('cert_in_scope', { p_holder: holderId }),
  ])
  return ok === true && inScope === true
}

// Date achieved of each person's current certificate of a type.
async function currentAchievedOn(supabase: ServerClient, holderIds: string[], typeId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('certificate_statuses').select('holder_id, achieved_on').eq('type_id', typeId).eq('is_current', true).in('holder_id', holderIds)
  return new Map((data ?? []).map(r => [r.holder_id as string, r.achieved_on as string]))
}

async function loadType(supabase: ServerClient, id: string): Promise<CertificationTypeRow | null> {
  if (!UUID_RE.test(id)) return null
  const { data } = await supabase.from('certification_type_statuses').select(TYPE_COLUMNS).eq('id', id).maybeSingle()
  return (data as CertificationTypeRow | null) ?? null
}

// Uploads the form's attachment (if any). Returns the stored path, null for no file, or an error.
async function uploadAttachment(formData: FormData, holderId: string): Promise<{ path: string | null } | { error: string }> {
  const file = formData.get('attachment') as File | null
  const checked = checkAttachment(file && typeof file === 'object' ? file : null)
  if (!checked) return { path: null }
  if ('error' in checked) return checked
  // A server action's File has to become a Buffer for storage uploads (see actions/resources.ts).
  const bytes = Buffer.from(await file!.arrayBuffer())
  const badContent = attachmentContentError(bytes, checked.ext)
  if (badContent) return { error: badContent }
  const path = `certificates/${holderId}/${crypto.randomUUID()}.${checked.ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: ATTACHMENT_CONTENT_TYPES[checked.ext],
  })
  if (error) return { error: 'The attachment couldn’t be uploaded. Please try again.' }
  return { path }
}

async function deleteFile(path: string | null) {
  if (path) await createAdminClient().storage.from(BUCKET).remove([path])
}

// ── Add / renew ──────────────────────────────────────────────────────────────
// A renewal is an ordinary new certificate of the same type with a later date;
// the database works out that it's a renewal (audit + notification).
export async function addCertificateAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const holderId = str(formData, 'holder_id')
  const renewsId = str(formData, 'renews_id')
  const supabase = await createClient()
  if (!UUID_RE.test(holderId)) return { error: 'Person not found.' }
  if (!(await can(supabase, 'certifications.award', holderId))) return { error: 'You don’t have permission to add certificates for this person.' }

  let typeId = str(formData, 'type_id')
  if (renewsId) {
    const { data: old } = await supabase.from('certificate_statuses').select('type_id, holder_id, is_current').eq('id', renewsId).maybeSingle()
    if (!old || old.holder_id !== holderId) return { error: 'Certificate not found.' }
    if (!old.is_current) return { error: 'This certificate has already been renewed.' }
    typeId = old.type_id
  }
  const type = await loadType(supabase, typeId)
  // Adding a type the person already holds renews it (Story 10.5 Sc06), so the date must follow the current one.
  const previous = type ? (await currentAchievedOn(supabase, [holderId], type.id)).get(holderId) ?? null : null
  const renewal = !!previous
  const achievedOn = str(formData, 'achieved_on')
  const format = str(formData, 'format') || 'physical'
  const invalid = validateAward({ achievedOn, format }, type, todayDateString(), previous)
  if (invalid) return { error: invalid }
  // Digital or Both generates the certificate PDF from the type's current design (Story 10.5 Sc04);
  // without a design, a certificate can only be recorded as physical (Story 10.4 Sc02).
  const digital = format !== 'physical'
  const designVersion = digital ? (await currentDesignVersions([typeId]))[typeId] ?? null : null
  if (digital && !designVersion) return { error: `${type!.name} has no digital certificate design yet, so it can only be recorded as physical.` }

  const uploaded = await uploadAttachment(formData, holderId)
  if ('error' in uploaded) return { error: uploaded.error }

  const { data: inserted, error } = await supabase.from('certificates').insert({
    holder_id: holderId, type_id: typeId, achieved_on: achievedOn, format: format as CertificateFormat, attachment_path: uploaded.path,
    design_version: designVersion,
  }).select('id, certificate_number').single()
  if (error || !inserted) {
    await deleteFile(uploaded.path)
    return { error: describeCertError(error) }
  }
  revalidateProfiles()
  const done = renewal ? `${type!.name} renewed.` : `${type!.name} added.`
  if (digital) {
    const issued = await issueCertificatePdf(inserted.id)
    if ('error' in issued) {
      return { success: true, message: `${done} Certificate ${inserted.certificate_number} was numbered, but its PDF couldn’t be made (${issued.error}) Use Edit → re-issue the PDF to try again.` }
    }
    return { success: true, message: `${done} Digital certificate ${inserted.certificate_number} is ready.` }
  }
  return { success: true, message: done }
}

// ── Edit (Story 10.6) ────────────────────────────────────────────────────────
export async function editCertificateAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const id = str(formData, 'certificate_id')
  const reason = str(formData, 'reason')
  const supabase = await createClient()
  const { data: cert } = UUID_RE.test(id)
    ? await supabase.from('certificate_statuses').select('holder_id, type_id, achieved_on, format, attachment_path, removed_at, certificate_number, design_version').eq('id', id).maybeSingle()
    : { data: null }
  if (!cert) return { error: 'Certificate not found.' }
  if (cert.removed_at) return { error: 'A removed certificate can’t be edited.' }
  if (!(await can(supabase, 'certifications.official.edit', cert.holder_id))) return { error: 'You don’t have permission to edit this certificate.' }

  const type = await loadType(supabase, cert.type_id)
  const achievedOn = str(formData, 'achieved_on')
  const format = str(formData, 'format')
  // A retired type can still have its certificates corrected, so check the date rules as if it were active.
  const invalid = validateAward({ achievedOn, format }, type && { ...type, status: 'active' }, todayDateString())
  if (invalid) return { error: invalid }
  if (!reason) return { error: 'Give a reason for the change. The person will see it.' }

  // The PDF (Story 10.6 Sc03): 'keep' it, or re-issue it with the 'original' design version or the
  // 'current' one. A certificate with no PDF yet that becomes Digital or Both gets one from the current design.
  const pdfChoice = str(formData, 'pdf') || 'keep'
  const hasNumber = !!cert.certificate_number
  const needsFirstPdf = !hasNumber && format !== 'physical'
  let designVersion: number | null = null
  if (needsFirstPdf || (hasNumber && pdfChoice === 'current')) {
    designVersion = (await currentDesignVersions([cert.type_id]))[cert.type_id] ?? null
    if (!designVersion) return { error: `${type?.name ?? 'This type'} has no digital certificate design yet, so it can only be recorded as physical.` }
  } else if (hasNumber && pdfChoice === 'original') {
    designVersion = cert.design_version
  }
  const reissue = designVersion != null

  const hasFile = !!checkAttachment(formData.get('attachment') as File | null)
  if (achievedOn === cert.achieved_on && format === cert.format && !hasFile && !reissue) return { error: 'Nothing has changed.' }

  const uploaded = await uploadAttachment(formData, cert.holder_id)
  if ('error' in uploaded) return { error: uploaded.error }

  const { error } = await supabase.rpc('edit_certificate', {
    p_id: id, p_achieved_on: achievedOn, p_format: format, p_attachment_path: uploaded.path,
    p_reissue: reissue, p_design_version: designVersion, p_reason: reason,
  })
  if (error) {
    await deleteFile(uploaded.path)
    return { error: describeCertError(error) }
  }
  // The old attachment is kept: earlier versions of a certificate stay part of its history.
  revalidateProfiles()
  if (reissue) {
    const issued = await issueCertificatePdf(id)
    if ('error' in issued) return { success: true, message: `Certificate updated, but its PDF couldn’t be made (${issued.error}) Try re-issuing it again.` }
    return { success: true, message: needsFirstPdf ? 'Certificate updated and its digital certificate generated.' : 'Certificate updated and its PDF re-issued.' }
  }
  return { success: true, message: 'Certificate updated.' }
}

// A short-lived link to an issued certificate's PDF (Story 10.6 Sc01). The
// user's own client must be able to see the certificate; only then is it signed.
export async function certificatePdfLinkAction(certificateId: string): Promise<string | null> {
  if (!UUID_RE.test(certificateId)) return null
  const supabase = await createClient()
  const { data } = await supabase.from('certificates').select('pdf_path').eq('id', certificateId).maybeSingle()
  if (!data?.pdf_path) return null
  const { data: signed } = await createAdminClient().storage.from(BUCKET).createSignedUrl(data.pdf_path, 300)
  return signed?.signedUrl ?? null
}

// ── Remove (Story 10.7) and undo (Story 10.8) ────────────────────────────────
export async function removeCertificateAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const id = str(formData, 'certificate_id')
  const category = str(formData, 'category')
  const reason = str(formData, 'reason')
  const invalid = validateRemoval(category, reason)
  if (invalid) return { error: invalid }
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_certificate', { p_id: id, p_category: category, p_reason: reason })
  if (error) return { error: describeCertError(error) }
  revalidateProfiles()
  return { success: true, message: 'Certificate removed.' }
}

export async function restoreCertificateAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_certificate', { p_id: str(formData, 'certificate_id') })
  if (error) return { error: describeCertError(error) }
  revalidateProfiles()
  return { success: true, message: 'Removal undone.' }
}

// ── Add to several people (Story 10.5 Sc06) ──────────────────────────────────
// One type and date for everyone selected. Each person is added on their own,
// so one refusal (e.g. a later certificate already on record) doesn't stop the rest.
// Someone who already holds the type gets it renewed, as in Story 10.5 Sc06.
export type BulkAwardState = { error?: string; done?: { name: string; ok: boolean; note?: string }[] } | null

export async function addCertificateToManyAction(_prev: BulkAwardState, formData: FormData): Promise<BulkAwardState> {
  const holderIds = [...new Set(formData.getAll('holder_ids').map(String).filter(id => UUID_RE.test(id)))]
  if (!holderIds.length) return { error: 'Select at least one person.' }
  if (holderIds.length > 200) return { error: 'Select at most 200 people at a time.' }
  const supabase = await createClient()
  const type = await loadType(supabase, str(formData, 'type_id'))
  const achievedOn = str(formData, 'achieved_on')
  const format = str(formData, 'format') || 'physical'
  const invalid = validateAward({ achievedOn, format }, type, todayDateString())
  if (invalid) return { error: invalid }
  const { data: allowed } = await supabase.rpc('cert_can', { p_permission: 'certifications.award' })
  if (allowed !== true) return { error: 'You don’t have permission to add certificates.' }

  const [{ data: people }, previous] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', holderIds),
    currentAchievedOn(supabase, holderIds, type!.id),
  ])
  const names = new Map((people ?? []).map(p => [p.id, p.full_name as string]))

  const done: NonNullable<BulkAwardState>['done'] = []
  for (const id of holderIds) {
    const name = names.get(id) ?? 'Unknown person'
    const prev = previous.get(id)
    if (prev && achievedOn <= prev) { done.push({ name, ok: false, note: `Already has ${type!.name} from ${formatCertDate(prev)}` }); continue }
    const { error } = await supabase.from('certificates').insert({ holder_id: id, type_id: type!.id, achieved_on: achievedOn, format: format as CertificateFormat })
    done.push(error ? { name, ok: false, note: describeCertError(error) } : { name, ok: true, note: prev ? 'Renewed' : undefined })
  }
  if (done.some(d => d.ok)) revalidateProfiles()
  return { done }
}

// ── Attachments ──────────────────────────────────────────────────────────────
// A short-lived link to an attachment. Signed with the user's own client, so
// storage only signs files of certificates this user can see.
export async function attachmentLinkAction(path: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

// ── Notifications (Story 10.12) ──────────────────────────────────────────────
export async function markNotificationsReadAction(ids: string[]): Promise<void> {
  const clean = ids.filter(id => UUID_RE.test(id))
  if (!clean.length) return
  const supabase = await createClient()
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', clean).is('read_at', null)
}
