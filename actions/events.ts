'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { orgDateTimeToIso } from '@/lib/org-date'
import { readClubIds } from '@/lib/event-clubs'

export type EventActionState = { error?: string; success?: boolean } | null

function readFields(formData: FormData) {
  const title        = (formData.get('title') as string | null)?.trim()
  const type         = formData.get('type') as string | null
  const eventDate    = formData.get('event_date') as string | null
  const startTime    = formData.get('start_time') as string | null
  const endTime      = (formData.get('end_time') as string | null) || null
  const clubIds      = readClubIds(formData) // none = open to all clubs
  const facilitator  = (formData.get('facilitator') as string | null)?.trim() || null
  const venue        = (formData.get('venue') as string | null)?.trim()
  const virtualLink  = (formData.get('virtual_link') as string | null)?.trim() || null
  const description  = (formData.get('description') as string | null)?.trim() || null
  const maxParticipants = (formData.get('max_participants') as string | null) || null

  return { title, type, eventDate, startTime, endTime, clubIds, facilitator, venue, virtualLink, description, maxParticipants }
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

// A Champion may link an event to their own club only (or to none); a
// Super Admin to any clubs. The database enforces the same rule (RLS on
// event_clubs) — this just gives a readable message first.
async function checkClubChoice(supabase: ServerClient, userId: string, clubIds: string[]): Promise<string | null> {
  const { data: caller } = await supabase.from('profiles').select('role, club_id').eq('id', userId).single()
  if (caller?.role === 'super_admin') return null
  if (caller?.role === 'champion') {
    return clubIds.every(id => id === caller.club_id) ? null : 'You can only link an event to your own club.'
  }
  return 'Not authorized.'
}

// Replaces the event's clubs in one step (see set_event_clubs in the migration).
async function saveEventClubs(supabase: ServerClient, eventId: string, clubIds: string[]) {
  const { error } = await supabase.rpc('set_event_clubs', { p_event_id: eventId, p_club_ids: clubIds })
  return error
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

  const clubError = await checkClubChoice(supabase, user.id, fields.clubIds)
  if (clubError) return { error: clubError }

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
      club_id: null, // clubs live in event_clubs now
      facilitator: fields.facilitator,
      virtual_link: fields.virtualLink,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const linkError = await saveEventClubs(supabase, event.id, fields.clubIds)
  if (linkError) {
    // Don't leave a half-saved event behind (neither role may delete
    // events through RLS, so this uses the admin client).
    await createAdminClient().from('events').delete().eq('id', event.id)
    return { error: 'The event could not be linked to the selected clubs. Please try again.' }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.created',
    entityType: 'event',
    entityId: event.id,
    details: { title: fields.title, type: fields.type, starts_at: startsAt, club_ids: fields.clubIds },
  })

  revalidatePath('/super-admin/events')
  revalidatePath('/champion/events')
  return { success: true }
}

// Uses the regular authenticated client — RLS ("events: champion update own
// events") is what actually enforces that a Champion can only edit events
// they created, and event_clubs' policies that they can only link their
// own club.
export async function updateEventAction(
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const eventId = formData.get('event_id') as string
  const fields = readFields(formData)
  const validationError = validate(fields)
  if (validationError) return { error: validationError }

  // The form's date and times are Sri Lanka time (see lib/org-date.ts).
  const startsAt = orgDateTimeToIso(fields.eventDate!, fields.startTime!)
  const endsAt = fields.endTime ? orgDateTimeToIso(fields.eventDate!, fields.endTime) : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clubError = await checkClubChoice(supabase, user.id, fields.clubIds)
  if (clubError) return { error: clubError }

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
      club_id: null, // clubs live in event_clubs now
    })
    .eq('id', eventId)
    .select('id')

  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: 'Event not found, or you do not have permission to edit it.' }

  const linkError = await saveEventClubs(supabase, eventId, fields.clubIds)
  if (linkError) return { error: 'The event was saved, but its clubs could not be updated. Please try again.' }

  await writeAuditLog({
    actorId: user.id,
    action: 'event.updated',
    entityType: 'event',
    entityId: eventId,
    details: { title: fields.title, type: fields.type, starts_at: startsAt, club_ids: fields.clubIds },
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
