'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginPath } from '@/lib/login-redirect.server'
import { writeAuditLog } from '@/lib/audit'
import { readClubChoice } from '@/lib/event-clubs'
import type { FieldErrors } from '@/lib/form-errors'
import { resolveSchedule } from '@/lib/announcement-schedule'
import {
  ANNOUNCEMENT_CLUBS_EMBED,
  announcementClubIds,
  readRecipientIds,
  resolveAnnouncementScope,
  type AnnouncementScope,
} from '@/lib/announcement-clubs'

export type AnnouncementActionState = { error?: string; fieldErrors?: FieldErrors; success?: boolean } | null

// Permission keys (Permissions screen) a Champion needs (sheet row 61).
// Super Admins always may.
const PUBLISH_PERMISSION = 'publish_club_announcements'
const DELETE_PERMISSION = 'delete_announcements'

const PRIORITIES = ['standard', 'mandatory', 'urgent']
const AUDIENCES = ['all', 'champions', 'gatekeepers', 'specific_clubs']

function readFields(formData: FormData) {
  const title       = (formData.get('title') as string | null)?.trim()
  const body        = (formData.get('body') as string | null)?.trim()
  const scheduleMode = formData.get('schedule_mode') === 'later' ? 'later' as const : 'now' as const
  const publishDate = (formData.get('publish_date') as string | null) || null
  const publishTime = (formData.get('publish_time') as string | null) || null
  const expiryDate  = (formData.get('expiry_date') as string | null) || null
  const expiryTime  = (formData.get('expiry_time') as string | null) || null
  const priority    = (formData.get('priority') as string | null) || 'standard'
  const audience    = (formData.get('audience') as string | null) || 'all'
  const clubChoice  = readClubChoice(formData) // "Specific Cohort" only
  const recipientIds = readRecipientIds(formData)
  const intent      = (formData.get('intent') as string | null) || 'publish'
  const isPinned    = formData.get('is_pinned') ? true : false

  return { title, body, scheduleMode, publishDate, publishTime, expiryDate, expiryTime, priority, audience, clubChoice, recipientIds, intent, isPinned }
}

type Fields = ReturnType<typeof readFields>
type Failure = { error: string; fieldErrors?: FieldErrors }
const fieldFail = (field: string, error: string): Failure => ({ error, fieldErrors: { [field]: error } })

function validate(fields: Fields): Failure | null {
  if (!fields.title) return fieldFail('title', 'Title is required.')
  if (!fields.body) return fieldFail('body', 'Content is required.')
  if (!PRIORITIES.includes(fields.priority)) return fieldFail('priority', 'Choose a priority level.')
  if (!AUDIENCES.includes(fields.audience)) return fieldFail('audience', 'Choose who the announcement is for.')
  return null
}

function schedule(fields: Fields, existingPublishIso?: string | null) {
  const r = resolveSchedule({
    mode: fields.scheduleMode, publishDate: fields.publishDate, publishTime: fields.publishTime,
    expiryDate: fields.expiryDate, expiryTime: fields.expiryTime, existingPublishIso,
  })
  return r.ok ? r : fieldFail(r.field, r.error)
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function getCaller(supabase: ServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())
  const { data: profile } = await supabase.from('profiles').select('role, club_id').eq('id', user.id).single()
  return { id: user.id, role: profile?.role ?? null, club_id: profile?.club_id ?? null }
}

// Champions need the permission (the database checks it too); Super Admins always may.
async function mayUse(supabase: ServerClient, role: string | null, permission: string): Promise<boolean> {
  if (role === 'super_admin') return true
  if (role !== 'champion') return false
  const { data } = await supabase.rpc('cert_can', { p_permission: permission })
  return data === true
}

async function activeClubIds(supabase: ServerClient): Promise<Set<string>> {
  const { data } = await supabase.from('clubs').select('id').eq('is_active', true)
  return new Set((data ?? []).map(c => c.id as string))
}

// The database refuses anything the checks above miss (RLS, save_announcement).
function describeSaveError(error: { code?: string; message?: string }): Failure {
  const message = error.message ?? ''
  if (message.includes('row-level security')) return { error: "You don't have permission to do that for this announcement or club." }
  if (/expiry date and time/.test(message)) return fieldFail('expiry_date', message)
  if (/publication time/.test(message)) return fieldFail('publish_time', message)
  if (/pick must be an active/.test(message)) return fieldFail('recipient_ids', message)
  if (/at least one club/.test(message)) return fieldFail('club_ids', message)
  if (error.code === '42501' || error.code === '23514') return { error: message }
  return { error: 'The announcement could not be saved. Please try again.' }
}

// save_announcement saves the announcement, its clubs and its people in one
// transaction, under the caller's own RLS (migrations 20261031000000, 20261110000001).
async function save(
  supabase: ServerClient,
  announcementId: string | null,
  fields: Fields,
  scope: AnnouncementScope,
  when: { publishIso: string; expiryIso: string | null },
) {
  return supabase.rpc('save_announcement', {
    p_announcement_id: announcementId,
    p_title: fields.title,
    p_body: fields.body,
    p_publish_date: when.publishIso,
    p_expiry_date: when.expiryIso,
    p_priority: fields.priority,
    p_audience: scope.audience,
    p_status: fields.intent === 'draft' ? 'draft' : 'published',
    p_is_pinned: fields.isPinned,
    p_is_all_clubs: scope.allClubs,
    p_club_ids: scope.clubIds,
    p_recipient_ids: scope.recipientIds,
  })
}

function revalidateAnnouncements() {
  revalidatePath('/super-admin/announcements')
  revalidatePath('/champion/announcements')
}

function auditDetails(fields: Fields, scope: AnnouncementScope, when: { publishIso: string; expiryIso: string | null }) {
  return {
    title: fields.title, publish_date: when.publishIso, expiry_date: when.expiryIso, priority: fields.priority,
    audience: scope.audience, all_clubs: scope.allClubs, club_ids: scope.clubIds, recipient_ids: scope.recipientIds,
    is_pinned: fields.isPinned, status: fields.intent === 'draft' ? 'draft' : 'published',
  }
}

export async function createAnnouncementAction(
  _prev: AnnouncementActionState,
  formData: FormData
): Promise<AnnouncementActionState> {
  const fields = readFields(formData)
  const invalid = validate(fields)
  if (invalid) return invalid
  const when = schedule(fields)
  if ('error' in when) return when

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  if (!(await mayUse(supabase, caller.role, PUBLISH_PERMISSION))) {
    return { error: "You don't have permission to publish announcements." }
  }
  const scope = resolveAnnouncementScope(caller, fields.audience, fields.clubChoice, await activeClubIds(supabase), [], fields.recipientIds)
  if ('error' in scope) return fieldFail('club_ids', scope.error)

  const { data: announcementId, error } = await save(supabase, null, fields, scope, when)
  if (error || !announcementId) return describeSaveError(error ?? {})

  await writeAuditLog({
    actorId: caller.id,
    action: 'announcement.created',
    entityType: 'announcement',
    entityId: announcementId as string,
    details: auditDetails(fields, scope, when),
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
  const invalid = validate(fields)
  if (invalid) return invalid

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  if (!(await mayUse(supabase, caller.role, PUBLISH_PERMISSION))) {
    return { error: "You don't have permission to edit announcements." }
  }
  const { data: existing } = await supabase
    .from('announcements')
    .select(`id, publish_date, ${ANNOUNCEMENT_CLUBS_EMBED}`)
    .eq('id', announcementId)
    .maybeSingle()
  if (!existing) return { error: 'Announcement not found.' }

  const when = schedule(fields, existing.publish_date as string)
  if ('error' in when) return when

  const scope = resolveAnnouncementScope(
    caller, fields.audience, fields.clubChoice, await activeClubIds(supabase), announcementClubIds(existing), fields.recipientIds
  )
  if ('error' in scope) return fieldFail('club_ids', scope.error)

  const { error } = await save(supabase, announcementId, fields, scope, when)
  if (error) return describeSaveError(error)

  await writeAuditLog({
    actorId: caller.id,
    action: 'announcement.updated',
    entityType: 'announcement',
    entityId: announcementId,
    details: auditDetails(fields, scope, when),
  })

  revalidateAnnouncements()
  return { success: true }
}

// How many people an announcement will reach, each counted once (sheet row 38).
export async function countAnnouncementRecipientsAction(input: {
  audience: string
  allClubs: boolean
  clubIds: string[]
  recipientIds: string[]
}): Promise<{ count: number } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('announcement_recipient_count', {
    p_audience: AUDIENCES.includes(input.audience) ? input.audience : 'all',
    p_is_all_clubs: input.allClubs,
    p_club_ids: input.clubIds,
    p_recipient_ids: input.recipientIds,
  })
  if (error) return { error: "Couldn't count the recipients." }
  return { count: Number(data ?? 0) }
}

// Active Champions and Gatekeepers in the chosen clubs, for the people picker
// (sheet row 38). RLS limits a Champion to their own club.
export async function listCohortPeopleAction(clubIds: string[]): Promise<{ id: string; full_name: string; role: string; club_id: string }[]> {
  if (!clubIds.length) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, club_id')
    .in('club_id', clubIds.slice(0, 200))
    .in('role', ['champion', 'gatekeeper'])
    .eq('is_active', true)
    .order('full_name')
  return (data ?? []) as { id: string; full_name: string; role: string; club_id: string }[]
}

export async function deleteAnnouncementAction(formData: FormData) {
  const announcementId = formData.get('announcement_id') as string

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  // Champions need delete_announcements (row 61); the database checks it too.
  if (!(await mayUse(supabase, caller.role, DELETE_PERMISSION))) return

  const { error } = await supabase.from('announcements').delete().eq('id', announcementId)
  if (error) return

  await writeAuditLog({
    actorId: caller.id,
    action: 'announcement.deleted',
    entityType: 'announcement',
    entityId: announcementId,
  })

  revalidateAnnouncements()
}
