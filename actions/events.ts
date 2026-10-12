'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { orgDateTimeToIso } from '@/lib/org-date'

export type EventActionState = { error?: string; success?: boolean } | null

function readFields(formData: FormData) {
  const title        = (formData.get('title') as string | null)?.trim()
  const type         = formData.get('type') as string | null
  const eventDate    = formData.get('event_date') as string | null
  const startTime    = formData.get('start_time') as string | null
  const endTime      = (formData.get('end_time') as string | null) || null
  const clubId       = formData.get('club_id') as string | null
  const facilitator  = (formData.get('facilitator') as string | null)?.trim() || null
  const venue        = (formData.get('venue') as string | null)?.trim()
  const virtualLink  = (formData.get('virtual_link') as string | null)?.trim() || null
  const description  = (formData.get('description') as string | null)?.trim() || null
  const maxParticipants = (formData.get('max_participants') as string | null) || null

  return { title, type, eventDate, startTime, endTime, clubId, facilitator, venue, virtualLink, description, maxParticipants }
}

// requireClub is false for updates: the edit form never submits club_id at
// all (the club is shown read-only, never reassignable — see
// updateEventAction), so validating its presence there would always fail.
function validate(fields: ReturnType<typeof readFields>, requireClub = true): string | null {
  const { title, type, eventDate, startTime, endTime, clubId, facilitator, venue } = fields
  if (!title) return 'Event title is required.'
  if (!type) return 'Event type is required.'
  if (!eventDate) return 'Event date is required.'
  if (!startTime) return 'Start time is required.'
  if (endTime && endTime <= startTime) return 'End time must be after the start time.'
  if (requireClub && !clubId) return 'Assigned club is required.'
  if (!facilitator) return 'Primary facilitator is required.'
  if (!venue) return 'Venue / location is required.'
  return null
}

export async function createEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  // The form's date and times are Sri Lanka time (see lib/org-date.ts).
  const startsAt = orgDateTimeToIso(fields.eventDate!, fields.startTime!)
  const endsAt = fields.endTime ? orgDateTimeToIso(fields.eventDate!, fields.endTime) : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      title: fields.title,
      type: fields.type,
      starts_at: startsAt,
      ends_at: endsAt,
      venue: fields.venue,
      description: fields.description,
      max_participants: fields.maxParticipants ? parseInt(fields.maxParticipants, 10) : null,
      club_id: fields.clubId,
      facilitator: fields.facilitator,
      virtual_link: fields.virtualLink,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.created',
    entityType: 'event',
    entityId: event.id,
    details: { title: fields.title, type: fields.type, starts_at: startsAt, club_id: fields.clubId },
  })

  revalidatePath('/super-admin/events')
  revalidatePath('/champion/events')
  return { success: true }
}

// Uses the regular authenticated client — RLS ("events: champion update club
// events", scoped to club_id = current_user_club_id()) is what actually
// enforces that a Champion can only edit their own club's events; club_id
// itself is never editable here (no picker in the edit form), so there's no
// path for a Champion to move an event to a different club.
export async function updateEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const eventId = formData.get('event_id') as string
  const fields = readFields(formData)
  const validationError = validate(fields, false)
  if (validationError) return { error: validationError }

  // The form's date and times are Sri Lanka time (see lib/org-date.ts).
  const startsAt = orgDateTimeToIso(fields.eventDate!, fields.startTime!)
  const endsAt = fields.endTime ? orgDateTimeToIso(fields.eventDate!, fields.endTime) : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: updated, error } = await supabase
    .from('events')
    .update({
      title: fields.title,
      type: fields.type,
      starts_at: startsAt,
      ends_at: endsAt,
      venue: fields.venue,
      description: fields.description,
      max_participants: fields.maxParticipants ? parseInt(fields.maxParticipants, 10) : null,
      facilitator: fields.facilitator,
      virtual_link: fields.virtualLink,
    })
    .eq('id', eventId)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'Event not found, or you do not have permission to edit it.' }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.updated',
    entityType: 'event',
    entityId: eventId,
    details: { title: fields.title, type: fields.type, starts_at: startsAt },
  })

  revalidatePath('/champion/events')
  revalidatePath('/super-admin/events')
  return { success: true }
}

// Events are cancelled, never deleted (Story 6.1 / checklist 2.4 convention
// — no DELETE RLS policy exists for champions either).
export async function cancelEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const eventId = formData.get('event_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: updated, error } = await supabase
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', eventId)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'Event not found, or you do not have permission to cancel it.' }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.cancelled',
    entityType: 'event',
    entityId: eventId,
    details: {},
  })

  revalidatePath('/champion/events')
  revalidatePath('/super-admin/events')
  return { success: true }
}
