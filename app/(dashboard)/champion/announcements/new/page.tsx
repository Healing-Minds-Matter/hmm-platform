import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { CreateAnnouncementForm } from '../create-announcement-form'

export const metadata = { title: 'New Announcement — HMM Champion' }

export default async function NewChampionAnnouncementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', user.id)
    .single()
  if (!profile?.club_id) redirect('/champion')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = profile.clubs as any

  return (
    <div className="flex justify-center p-8">
      <CreateAnnouncementForm clubName={club?.name ?? 'Your Club'} />
    </div>
  )
}
