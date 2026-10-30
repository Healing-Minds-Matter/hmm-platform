'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { readClubChoice } from '@/lib/event-clubs'
import {
  ANNOUNCEMENT_CLUBS_EMBED,
  announcementClubIds,
  resolveAnnouncementScope,
  type AnnouncementScope,
} from '@/lib/announcement-clubs'

export type AnnouncementActionState = { error?: string; success?: boolean } | null

function readFields(formData: FormData) {
  const title      = (formData.get('title') as string | null)?.trim()
  const body       = (formData.get('body') as string | null)?.trim()
  const publishDate = formData.get('publish_date') as string | null
  const expiryDate  = (formData.get('expiry_date') as string | null) || null
  const priority    = (formData.get('priority') as string | null) || 'standard'
  const audience    = (formData.get('audience') as string | null) || 'all'
  const clubChoice  = readClubChoice(formData) // "Specific Cohort" only
  const intent      = (formData.get('intent') as string | null) || 'publish'
  const isPinned    = formData.get('is_pinned') ? true : false

  return { title, body, publishDate, expiryDate, priority, audience, clubChoice, intent, isPinned }
}

function validate(fields: ReturnType<typeof readFields>): string | null {
  const { title, body, publishDate, expiryDate } = fields
  if (!title) return 'Title is required.'
  if (!body) return 'Content is required.'
  if (!publishDate) return 'Publication date is required.'
  if (expiryDate && expiryDate < publishDate) return 'Expiry date must be on or after the publication date.'
  return null
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function getCaller(supabase: ServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role, club_id').eq('id', user.id).single()
  return { id: user.id, role: profile?.role ?? null, club_id: profile?.club_id ?? null }
}

async function activeClubIds(supabase: ServerClient): Promise<Set<string>> {
  const { data } = await supabase.from('clubs').select('id').eq('is_active', true)
  return new Set((data ?? []).map(c => c.id as string))
}

// The database refuses anything the checks above miss (RLS, save_announcement).
function describeSaveError(error: { code?: string; message?: string }): string {
  const message = error.message ?? ''
  if (message.includes('row-level security')) return "You don't have permission to do that for this announcement or club."
  if (error.code === '42501' || error.code === '23514') return message
  return 'The announcement could not be saved. Please try again.'
}

// save_announcement saves the announcement and its clubs in one
// transaction, under the caller's own RLS (migration 20261031000000).
async function save(
  supabase: ServerClient,
  announcementId: string | null,
  fields: ReturnType<typeof readFields>,
  scope: AnnouncementScope
) {
  return supabase.rpc('save_announcement', {
    p_announcement_id: announcementId,
    p_title: fields.title,
    p_body: fields.body,
    p_publish_date: fields.publishDate,
    p_expiry_date: fields.expiryDate,
    p_priority: fields.priority,
    p_audience: scope.audience,
    p_status: fields.intent === 'draft' ? 'draft' : 'published',
    p_is_pinned: fields.isPinned,
    p_is_all_clubs: scope.allClubs,
    p_club_ids: scope.clubIds,
  })
}

function revalidateAnnouncements() {
  revalidatePath('/super-admin/announcements')
  revalidatePath('/champion/announcements')
}

export async function createAnnouncementAction(
  _prev: AnnouncementActionState,
  formData: FormData
): Promise<AnnouncementActionState> {
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  const scope = resolveAnnouncementScope(caller, fields.audience, fields.clubChoice, await activeClubIds(supabase))
  if ('error' in scope) return { error: scope.error }

  const { data: announcementId, error } = await save(supabase, null, fields, scope)
  if (error || !announcementId) return { error: describeSaveError(error ?? {}) }

  await writeAuditLog({
    actorId: caller.id,
    action: 'announcement.created',
    entityType: 'announcement',
    entityId: announcementId as string,
    details: {
      title: fields.title, publish_date: fields.publishDate, priority: fields.priority, audience: scope.audience,
      all_clubs: scope.allClubs, club_ids: scope.clubIds, status: fields.intent === 'draft' ? 'draft' : 'published',
    },
  })

  revalidateAnnouncements()
  return { success: true }
}

export async function updateAnnouncementAction(
  _prev: AnnouncementActionState,
  formData: FormData
): Promise<AnnouncementActionState> {
  const announcementId = formData.get('announcement_id') as string
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  const { data: existing } = await supabase
    .from('announcements')
    .select(`id, ${ANNOUNCEMENT_CLUBS_EMBED}`)
    .eq('id', announcementId)
    .maybeSingle()
  if (!existing) return { error: 'Announcement not found.' }

  const scope = resolveAnnouncementScope(
    caller, fields.audience, fields.clubChoice, await activeClubIds(supabase), announcementClubIds(existing)
  )
  if ('error' in scope) return { error: scope.error }

  const { error } = await save(supabase, announcementId, fields, scope)
  if (error) return { error: describeSaveError(error) }

  await writeAuditLog({
    actorId: caller.id,
    action: 'announcement.updated',
    entityType: 'announcement',
    entityId: announcementId,
    details: {
      title: fields.title, publish_date: fields.publishDate, priority: fields.priority, audience: scope.audience,
      all_clubs: scope.allClubs, club_ids: scope.clubIds,
    },
  })

  revalidateAnnouncements()
  return { success: true }
}

export async function deleteAnnouncementAction(formData: FormData) {
  const announcementId = formData.get('announcement_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('announcements').delete().eq('id', announcementId)
  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'announcement.deleted',
    entityType: 'announcement',
    entityId: announcementId,
  })

  revalidatePath('/super-admin/announcements')
  revalidatePath('/champion/announcements')
}
