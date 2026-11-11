'use server'

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth/guards.server'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { readCsvUpload } from '@/lib/csv'
import { batchLines, bulkIntent, type BulkUploadState } from '@/lib/bulk-upload'
import {
  createClubsFromCsv,
  describeClubInsertError,
  findClubConflict,
  validateClubFields,
  clubConflictField,
  type ClubField,
  type ClubFields,
  type ExistingClub,
} from '@/lib/club-rules'

async function getActorId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

export type ClubFormValues = {
  club_code: string
  name: string
  location: string
  description: string
  contact_email: string
  contact_phone: string
}

export type ClubActionState = { error?: string; fieldErrors?: FieldErrors; success?: boolean; values?: ClubFormValues } | null

export async function createClubAction(
  _prev: ClubActionState,
  formData: FormData
): Promise<ClubActionState> {
  const clubCode   = (formData.get('club_code')   as string | null)?.trim()
  const name       = (formData.get('name')         as string | null)?.trim()
  const location   = (formData.get('location')     as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const contactEmail = (formData.get('contact_email') as string | null)?.trim() || null
  const contactPhone = (formData.get('contact_phone') as string | null)?.trim() || null

  // React resets a form after its action finishes — even when the action
  // returns an error — so every error hands the entered values back for the
  // form to re-fill, instead of wiping everything over one bad field.
  const values: ClubFormValues = {
    club_code: clubCode ?? '',
    name: name ?? '',
    location: location ?? '',
    description: description ?? '',
    contact_email: contactEmail ?? '',
    contact_phone: contactPhone ?? '',
  }
  // field = the input the error belongs to, shown next to it (sheet row 32).
  const fail = (error: string, field?: ClubField | null): ClubActionState =>
    ({ error, values, ...(field ? { fieldErrors: { [field]: error } } : {}) })

  // Same rules as the bulk upload below — see lib/club-rules.ts.
  const checked = validateClubFields({
    name, code: clubCode, address: location, contactEmail, contactPhone, description,
  })
  if ('error' in checked) return fail(checked.error, checked.field)
  const fields = checked.club

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const conflict = findClubConflict(fields, await listExistingClubs(supabase))
  if (conflict) return fail(conflict, clubConflictField(conflict))

  const inserted = await insertClub(supabase, fields, user.id)
  if ('error' in inserted) return fail(inserted.error, clubConflictField(inserted.error))

  await logClubCreated(user.id, inserted.id, fields)

  // Without this the list kept its cached render, so the new club only
  // appeared after a manual refresh (every other create action does this).
  revalidatePath('/super-admin/clubs')
  return { success: true }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function listExistingClubs(supabase: ServerClient): Promise<ExistingClub[]> {
  const { data } = await supabase.from('clubs').select('name, club_code')
  return data ?? []
}

async function insertClub(
  supabase: ServerClient,
  fields: ClubFields,
  actorId: string
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('clubs')
    .insert({ ...fields, created_by: actorId })
    .select('id')
    .single()
  if (error || !data) return { error: describeClubInsertError(error ?? { message: '' }, fields) }
  return { id: data.id as string }
}

async function logClubCreated(actorId: string, clubId: string, fields: ClubFields, extra?: Record<string, unknown>) {
  await writeAuditLog({
    actorId,
    action: 'club.created',
    entityType: 'club',
    entityId: clubId,
    details: { club_code: fields.club_code, name: fields.name, ...extra },
  })
}

// Bulk CSV upload of clubs — Super Admin only. The role is checked here, not
// just by hiding the tab: server actions can be called directly, so the
// UI alone isn't a guard (RLS also limits club inserts to Super Admins).
// Two steps (see lib/bulk-upload.ts): intent=check previews, intent=save
// re-checks and creates the rows that pass.
export async function createClubsBulkAction(
  _prev: BulkUploadState,
  formData: FormData
): Promise<BulkUploadState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'super_admin') return { error: 'Only Super Admins can add clubs.' }

  const upload = await readCsvUpload(formData.get('csv_file') as File | null)
  if ('error' in upload) return { error: upload.error }

  const intent = bulkIntent(formData)
  const outcome = await createClubsFromCsv(upload, {
    existingClubs: await listExistingClubs(supabase),
    insertClub: fields => insertClub(supabase, fields, user.id),
    onCreated: (id, fields) => logClubCreated(user.id, id, fields, { source: 'bulk_csv' }),
  }, intent, batchLines(formData))
  if ('error' in outcome) return { error: outcome.error }

  if (outcome.results.some(r => r.status === 'created')) revalidatePath('/super-admin/clubs')
  return { intent, results: outcome.results }
}

export async function updateClubAction(
  _prev: ClubActionState,
  formData: FormData
): Promise<ClubActionState> {
  const clubId     = formData.get('club_id')    as string
  const name       = (formData.get('name')      as string | null)?.trim()
  const location   = (formData.get('location')  as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const contactEmail = (formData.get('contact_email') as string | null)?.trim() || null
  const contactPhone = (formData.get('contact_phone') as string | null)?.trim() || null

  if (!name)     return invalid('name', 'Club name is required.')
  if (!location) return invalid('location', 'Location is required.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { error } = await supabase
    .from('clubs')
    .update({ name, location, description, contact_email: contactEmail, contact_phone: contactPhone })
    .eq('id', clubId)

  if (error) {
    if (error.code === '23505') return invalid('name', 'A club with that name already exists.')
    return { error: error.message }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'club.updated',
    entityType: 'club',
    entityId: clubId,
    details: { name, location },
  })

  revalidatePath(`/super-admin/clubs/${clubId}`)
  revalidatePath('/super-admin/clubs')
  return { success: true }
}

export type ClubStatusResult = { success: true } | { error: string } | undefined

// Review Finding 6: one database call (set_club_active) changes the club, its
// members (the existing trigger ends their sessions), their delegations and
// the audit log together, in one transaction — a failure part-way leaves
// nothing changed. The database checks the caller again (active Super Admin)
// and records them as the actor.
async function setClubActive(formData: FormData, active: boolean): Promise<ClubStatusResult> {
  const clubId = formData.get('club_id')

  const caller = await requireSuperAdminForClubs()
  if (!caller) return { error: 'Only Super Admins can change a club’s status.' }
  if (typeof clubId !== 'string' || !UUID_RE.test(clubId)) return { error: 'Club not found.' }

  const { error } = await caller.supabase.rpc('set_club_active', { p_club_id: clubId, p_active: active })
  if (error) {
    if (error.code === 'P0002') return { error: 'Club not found.' }
    return { error: active ? 'The club couldn’t be reactivated. Nothing was changed — please try again.' : 'The club couldn’t be deactivated. Nothing was changed — please try again.' }
  }

  revalidatePath(`/super-admin/clubs/${clubId}`)
  revalidatePath('/super-admin/clubs')
  return { success: true }
}

export async function deactivateClubAction(formData: FormData): Promise<ClubStatusResult> {
  return setClubActive(formData, false)
}

export async function reactivateClubAction(formData: FormData): Promise<ClubStatusResult> {
  return setClubActive(formData, true)
}

/** For a plain <form action> (the clubs list's Reactivate button). */
export async function reactivateClubFormAction(formData: FormData): Promise<void> {
  await setClubActive(formData, true)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireSuperAdminForClubs() {
  const guard = await requireRole(['super_admin'])
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return null
  }
  return guard.caller
}
