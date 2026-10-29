'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { endDelegationsForDeactivatedUser } from '@/actions/permissions'
import { readCsvUpload } from '@/lib/csv'
import { batchLines, bulkIntent, type BulkUploadState } from '@/lib/bulk-upload'
import {
  createClubsFromCsv,
  describeClubInsertError,
  findClubConflict,
  validateClubFields,
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

export type ClubActionState = { error?: string; success?: boolean; values?: ClubFormValues } | null

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
  const fail = (error: string): ClubActionState => ({ error, values })

  // Same rules as the bulk upload below — see lib/club-rules.ts.
  const checked = validateClubFields({
    name, code: clubCode, address: location, contactEmail, contactPhone, description,
  })
  if ('error' in checked) return fail(checked.error)
  const fields = checked.club

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const conflict = findClubConflict(fields, await listExistingClubs(supabase))
  if (conflict) return fail(conflict)

  const inserted = await insertClub(supabase, fields, user.id)
  if ('error' in inserted) return fail(inserted.error)

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
  if (!user) redirect('/login')

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

  if (!name)     return { error: 'Club name is required.' }
  if (!location) return { error: 'Location is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('clubs')
    .update({ name, location, description, contact_email: contactEmail, contact_phone: contactPhone })
    .eq('id', clubId)

  if (error) {
    if (error.code === '23505') return { error: 'A club with that name already exists.' }
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

export async function deactivateClubAction(formData: FormData) {
  const clubId = formData.get('club_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Collect active members for audit log before deactivating
  const { data: affected } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('club_id', clubId)
    .eq('is_active', true)

  await supabase
    .from('clubs')
    .update({ is_active: false })
    .eq('id', clubId)

  if (affected && affected.length > 0) {
    await supabase
      .from('profiles')
      .update({
        is_active: false,
        deactivation_reason: 'club_deactivated',
        deactivated_club_id: clubId,
      })
      .eq('club_id', clubId)
      .eq('is_active', true)
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'club.deactivated',
    entityType: 'club',
    entityId: clubId,
    details: {
      affectedUsers: affected?.map(p => ({ id: p.id, role: p.role, name: p.full_name })) ?? [],
    },
  })

  for (const member of affected ?? []) {
    await endDelegationsForDeactivatedUser(member.id, user.id)
  }

  revalidatePath(`/super-admin/clubs/${clubId}`)
  revalidatePath('/super-admin/clubs')
}

export async function reactivateClubAction(formData: FormData) {
  const clubId = formData.get('club_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase
    .from('clubs')
    .update({ is_active: true })
    .eq('id', clubId)

  // Restore only cascade-deactivated members of this specific club
  const { data: restored } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      deactivation_reason: null,
      deactivated_club_id: null,
    })
    .eq('deactivated_club_id', clubId)
    .eq('deactivation_reason', 'club_deactivated')
    .select('id, full_name, role')

  await writeAuditLog({
    actorId: user.id,
    action: 'club.reactivated',
    entityType: 'club',
    entityId: clubId,
    details: {
      restoredUsers: restored?.map(p => ({ id: p.id, role: p.role, name: p.full_name })) ?? [],
    },
  })

  revalidatePath(`/super-admin/clubs/${clubId}`)
  revalidatePath('/super-admin/clubs')
}
