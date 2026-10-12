import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
// Pre-fills the form in Sri Lanka time, the same zone it is saved in.
import { isoToOrgDateTime } from '@/lib/org-date'
import { EditEventModal } from './edit-event-modal'

export default async function InterceptedEditChampionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('club_id').eq('id', user.id).single()
  if (!profile?.club_id) return null

  const { data: event } = await supabase
    .from('events')
    .select('id, title, type, starts_at, ends_at, venue, description, max_participants, club_id, facilitator, virtual_link, clubs(name)')
    .eq('id', id)
    .eq('club_id', profile.club_id)
    .single()

  if (!event) notFound()

  const { date, time: start_time } = isoToOrgDateTime(event.starts_at)
  const end_time = event.ends_at ? isoToOrgDateTime(event.ends_at).time : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clubName = (event.clubs as any)?.name ?? 'Your Club'

  return (
    <EditEventModal
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
        club_name: clubName,
      }}
    />
  )
}
