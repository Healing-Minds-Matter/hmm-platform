'use server'

// Self-reported certifications (Stories 10.9, 10.10). Everything runs with the
// signed-in user's own client: the database's rules (RLS, self_reported_before)
// decide who may add, change, withdraw, verify or remove. The holder's own
// attachment is uploaded with their client too, into self/{their id}/ (storage
// policy in migration 20261104000000); only clean-up after a failed save uses
// the admin client, for a file this request has just uploaded.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayDateString } from '@/lib/org-date'
import { checkAttachment, describeCertError } from '@/lib/certificates'
import { validateSelfRemoval, validateSelfReported } from '@/lib/self-reported'
import type { CertActionState } from '@/actions/certificates'

const BUCKET = 'certification-files'
const UUID_RE = /^[0-9a-f-]{36}$/i
const str = (formData: FormData, key: string) => ((formData.get(key) as string | null) ?? '').trim()

function revalidateAll() {
  revalidatePath('/champion/profile')
  revalidatePath('/champion/certifications', 'layout')
  revalidatePath('/champion/gatekeepers', 'layout')
  revalidatePath('/super-admin/certifications', 'layout')
  revalidatePath('/super-admin/gatekeepers', 'layout')
  revalidatePath('/super-admin/champions', 'layout')
}

function readForm(formData: FormData) {
  return {
    name: str(formData, 'name'),
    organisation: str(formData, 'organisation'),
    achievedOn: str(formData, 'achieved_on'),
    noExpiry: formData.get('no_expiry') === 'on',
    expiresOn: str(formData, 'expires_on'),
  }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function uploadOwn(supabase: ServerClient, userId: string, formData: FormData): Promise<{ path: string | null } | { error: string }> {
  const file = formData.get('attachment') as File | null
  const checked = checkAttachment(file && typeof file === 'object' ? file : null)
  if (!checked) return { path: null }
  if ('error' in checked) return checked
  const path = `self/${userId}/${crypto.randomUUID()}.${checked.ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await file!.arrayBuffer()), { contentType: file!.type || undefined })
  if (error) {
    return { error: (error.message ?? '').includes('row-level security') ? 'You don’t have permission to add certifications.' : 'The attachment couldn’t be uploaded. Please try again.' }
  }
  return { path }
}

async function deleteFile(path: string | null) {
  if (path) await createAdminClient().storage.from(BUCKET).remove([path])
}

// ── Holder: add, change, withdraw (Story 10.9) ───────────────────────────────
export async function addSelfReportedAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const checked = validateSelfReported(readForm(formData), todayDateString())
  if ('error' in checked) return { error: checked.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  const { data: allowed } = await supabase.rpc('cert_can', { p_permission: 'certifications.self.manage' })
  if (allowed !== true) return { error: 'You don’t have permission to add certifications.' }

  const uploaded = await uploadOwn(supabase, user.id, formData)
  if ('error' in uploaded) return { error: uploaded.error }
  const { error } = await supabase.from('self_reported_certificates').insert({ holder_id: user.id, ...checked.fields, attachment_path: uploaded.path })
  if (error) {
    await deleteFile(uploaded.path)
    return { error: describeCertError(error) }
  }
  revalidateAll()
  return { success: true, message: `${checked.fields.name} added. It shows as not verified until it’s reviewed.` }
}

export async function editSelfReportedAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const id = str(formData, 'self_id')
  const checked = validateSelfReported(readForm(formData), todayDateString())
  if ('error' in checked) return { error: checked.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  const { data: row } = UUID_RE.test(id)
    ? await supabase.from('self_reported_certificates').select('holder_id, state').eq('id', id).maybeSingle()
    : { data: null }
  if (!row || row.holder_id !== user.id) return { error: 'Certification not found.' }
  if (row.state !== 'unverified') return { error: 'Only certifications waiting for review can be changed.' }

  const uploaded = await uploadOwn(supabase, user.id, formData)
  if ('error' in uploaded) return { error: uploaded.error }
  const { error } = await supabase.from('self_reported_certificates')
    .update({ ...checked.fields, ...(uploaded.path ? { attachment_path: uploaded.path } : {}) })
    .eq('id', id)
  if (error) {
    await deleteFile(uploaded.path)
    return { error: describeCertError(error) }
  }
  revalidateAll()
  return { success: true, message: 'Certification updated.' }
}

export async function withdrawSelfReportedAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const id = str(formData, 'self_id')
  const supabase = await createClient()
  const { data, error } = await supabase.from('self_reported_certificates').update({ state: 'withdrawn' }).eq('id', id).eq('state', 'unverified').select('id')
  if (error) return { error: describeCertError(error) }
  if (!data?.length) return { error: 'Only certifications waiting for review can be withdrawn.' }
  revalidateAll()
  return { success: true, message: 'Certification withdrawn.' }
}

// ── Reviewer: verify, remove (Story 10.10) ───────────────────────────────────
export async function verifySelfReportedAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('review_self_reported', { p_id: str(formData, 'self_id'), p_verify: true, p_category: null, p_reason: null })
  if (error) return { error: describeCertError(error) }
  revalidateAll()
  return { success: true, message: 'Certification verified.' }
}

export async function removeSelfReportedAction(_prev: CertActionState, formData: FormData): Promise<CertActionState> {
  const category = str(formData, 'category')
  const reason = str(formData, 'reason')
  const invalid = validateSelfRemoval(category, reason)
  if (invalid) return { error: invalid }
  const supabase = await createClient()
  const { error } = await supabase.rpc('review_self_reported', { p_id: str(formData, 'self_id'), p_verify: false, p_category: category, p_reason: reason })
  if (error) return { error: describeCertError(error) }
  revalidateAll()
  return { success: true, message: 'Certification removed.' }
}
