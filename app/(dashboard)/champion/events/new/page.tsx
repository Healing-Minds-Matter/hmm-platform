import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateEventForm } from '@/app/(dashboard)/super-admin/events/create-event-form'

export const metadata = { title: 'Schedule Event — HMM Champion' }

export default async function NewChampionEventPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(id, name)')
    .eq('id', user.id)
    .single()
  if (!profile?.club_id) redirect('/champion')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = profile.clubs as any

  return (
    <div className="flex justify-center p-8">
      <CreateEventForm clubs={[]} ownClub={{ id: club.id, name: club.name }} fallbackPath="/champion/events" />
    </div>
  )
}
