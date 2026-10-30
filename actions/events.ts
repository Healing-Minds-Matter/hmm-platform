'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { orgDateTimeToIso } from '@/lib/org-date'
import {
  EVENT_CLUBS_EMBED,
  MSG_CANT_MANAGE,
  canManageEvent,
  checkClubChoice,
  eventClubIds,
  readClubChoice,
  type EventCaller,
} from '@/lib/event-clubs'

export type EventActionState = { error?: string; success?: boolean } | null

function readFields(formData: FormData) {
  const title        = (formData.get('title') as string | null)?.trim()
  const type         = formData.get('type') as string | null
  const eventDate    = formData.get('event_date') as string | null
  const startTime    = formData.get('start_time') as string | null
  const endTime      = (formData.get('end_time') as string | null) || null
  const facilitator  = (formData.get('facilitator') as string | null)?.trim() || null
  const venue        = (formData.get('venue') as string | null)?.trim()
  const virtualLink  = (formData.get('virtual_link') as string | null)?.trim() || null
  const description  = (formData.get('description') as string | null)?.trim() || null
  const maxParticipants = (formData.get('max_participants') as string | null) || null

  return { title, type, eventDate, startTime, endTime, facilitator, venue, virtualLink, description, maxParticipants }
}

function validate(fields: ReturnType<typeof readFields>): string | null {
  const { title, type, eventDate, startTime, endTime, facilitator, venue } = fields
  if (!title) return 'Event title is required.'
  if (!type) return 'Event type is required.'
  if (!eventDate) return 'Event date is required.'
  if (!startTime) return 'Start time is required.'
  if (endTime && endTime <= startTime) return 'End time must be after the start time.'
  if (!facilitator) return 'Primary facilitator is required.'
  if (!venue) return 'Venue / location is required.'
  return null
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function getCaller(supabase: ServerClient): Promise<EventCaller> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role, club_id').eq('id', user.id).single()
  return { id: user.id, role: profile?.role ?? null, club_id: profile?.club_id ?? null }
}

async function activeClubIds(supabase: ServerClient): Promise<Set<string>> {
  const { data } = await supabase.from('clubs').select('id').eq('is_active', true)
  return new Set((data ?? []).map(c => c.id as string))
}

// The event as the caller can see it (RLS), with its clubs.
async function loadEvent(supabase: ServerClient, eventId: string) {
  const { data } = await supabase
    .from('events')
    .select(`id, title, created_by, is_cancelled, ${EVENT_CLUBS_EMBED}`)
    .eq('id', eventId)
    .maybeSingle()
  return data
}

// The database refuses anything the checks above miss (RLS, save_event,
// the "all clubs or at least one club" trigger); turn those into plain words.
function describeSaveError(error: { code?: string; message?: string }): string {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('row-level security')) {
    return message.includes('row-level security') ? "You don't have permission to do that for this event or club." : message
  }
  if (error.code === '23514') return message
  return 'The event could not be saved. Please try again.'
}

function saveArgs(fields: ReturnType<typeof readFields>, allClubs: boolean, clubIds: string[]) {
  // The form's date and times are Sri Lanka time (see lib/org-date.ts).
  const startsAt = orgDateTimeToIso(fields.eventDate!, fields.startTime!)
  const endsAt = fields.endTime ? orgDateTimeToIso(fields.eventDate!, fields.endTime) : null
  return {
    p_title: fields.title,
    p_type: fields.type,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_venue: fields.venue,
    p_description: fields.description,
    p_max_participants: fields.maxParticipants ? parseInt(fields.maxParticipants, 10) : null,
    p_facilitator: fields.facilitator,
    p_virtual_link: fields.virtualLink,
    p_is_all_clubs: allClubs,
    p_club_ids: clubIds,
  }
}

function revalidateEvents() {
  revalidatePath('/super-admin/events')
  revalidatePath('/champion/events')
  revalidatePath('/super-admin')
  revalidatePath('/champion')
}

// Super Admin: all clubs or any active clubs. Champion: their own club only.
// save_event creates the event and its clubs in one transaction, under the
// caller's own RLS.
export async function createEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  const choice = readClubChoice(formData)
  const clubError = checkClubChoice(caller, choice, await activeClubIds(supabase))
  if (clubError) return { error: clubError }

  const args = saveArgs(fields, choice.allClubs, choice.clubIds)
  const { data: eventId, error } = await supabase.rpc('save_event', { p_event_id: null, ...args })
  if (error || !eventId) return { error: describeSaveError(error ?? {}) }

  await writeAuditLog({
    actorId: caller.id,
    action: 'event.created',
    entityType: 'event',
    entityId: eventId as string,
    details: { title: fields.title, type: fields.type, starts_at: args.p_starts_at, all_clubs: choice.allClubs, club_ids: choice.clubIds },
  })

  revalidateEvents()
  return { success: true }
}

// Super Admin: any event, including its clubs. Champion: only an event they
// created for their own club alone, and its club stays their club.
export async function updateEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const eventId = formData.get('event_id') as string
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  const event = await loadEvent(supabase, eventId)
  if (!event) return { error: 'Event not found.' }
  if (!canManageEvent(caller, event)) return { error: MSG_CANT_MANAGE }

  const choice = readClubChoice(formData)
  const clubError = checkClubChoice(caller, choice, await activeClubIds(supabase), eventClubIds(event))
  if (clubError) return { error: clubError }

  const args = saveArgs(fields, choice.allClubs, choice.clubIds)
  const { error } = await supabase.rpc('save_event', { p_event_id: eventId, ...args })
  if (error) return { error: describeSaveError(error) }

  await writeAuditLog({
    actorId: caller.id,
    action: 'event.updated',
    entityType: 'event',
    entityId: eventId,
    details: { title: fields.title, type: fields.type, starts_at: args.p_starts_at, all_clubs: choice.allClubs, club_ids: choice.clubIds },
  })

  revalidateEvents()
  return { success: true }
}

// Events are cancelled, never deleted (Story 6.1 / checklist 2.4).
export async function cancelEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const eventId = formData.get('event_id') as string

  const supabase = await createClient()
  const caller = await getCaller(supabase)
  const event = await loadEvent(supabase, eventId)
  if (!event) return { error: 'Event not found.' }
  if (!canManageEvent(caller, event)) return { error: MSG_CANT_MANAGE }

  const { data: updated, error } = await supabase
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', eventId)
    .select('id')

  if (error) return { error: describeSaveError(error) }
  if (!updated || updated.length === 0) return { error: MSG_CANT_MANAGE }

  await writeAuditLog({
    actorId: caller.id,
    action: 'event.cancelled',
    entityType: 'event',
    entityId: eventId,
    details: { title: event.title },
  })

  revalidateEvents()
  return { success: true }
}
