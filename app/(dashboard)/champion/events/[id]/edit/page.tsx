import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
// Pre-fills the form in Sri Lanka time, the same zone it is saved in.
import { isoToOrgDateTime } from '@/lib/org-date'
import { EVENT_CLUBS_EMBED, eventClubIds } from '@/lib/event-clubs'
import { EditEventForm } from './edit-event-form'

export const metadata = { title: 'Edit Event — HMM Champion' }

export default async function EditChampionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(id, name)')
    .eq('id', user.id)
    .single()
  if (!profile?.club_id) redirect('/champion')

  // Only the Champion who created an event may edit it (RLS enforces the same).
  const { data: event } = await supabase
    .from('events')
    .select(`id, title, type, starts_at, ends_at, venue, description, max_participants, facilitator, virtual_link, ${EVENT_CLUBS_EMBED}`)
    .eq('id', id)
    .eq('created_by', user.id)
    .single()

  if (!event) notFound()

  const { date, time: start_time } = isoToOrgDateTime(event.starts_at)
  const end_time = event.ends_at ? isoToOrgDateTime(event.ends_at).time : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownClub = profile.clubs as any

  return (
    <div className="flex justify-center p-8">
      <EditEventForm
        event={{
          id: event.id,
          title: event.title,
          type: event.type,
          event_date: date,
          start_time,
          end_time,
          venue: event.venue,
          facilitator: event.facilitator ?? '',
          virtual_link: event.virtual_link ?? '',
          max_participants: event.max_participants ? String(event.max_participants) : '',
          description: event.description ?? '',
          own_club: { id: ownClub.id, name: ownClub.name },
        club_ids: eventClubIds(event),
        }}
      />
    </div>
  )
}
