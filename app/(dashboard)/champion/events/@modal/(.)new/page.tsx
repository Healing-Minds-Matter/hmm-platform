import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { NewChampionEventModal } from './new-event-modal'

export default async function InterceptedNewChampionEventPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(id, name)')
    .eq('id', user.id)
    .single()
  if (!profile?.club_id) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = profile.clubs as any

  return <NewChampionEventModal club={{ id: club.id, name: club.name }} />
}
