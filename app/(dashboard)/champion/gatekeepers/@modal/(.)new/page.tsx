import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { awardableTypes } from '@/lib/certifications.server'
import { NewGatekeeperModal } from './new-gatekeeper-modal'

export default async function InterceptedNewGatekeeperPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.club_id) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = profile.clubs as any
  const certTypes = await awardableTypes(supabase)

  return <NewGatekeeperModal clubName={club?.name ?? 'Your Club'} certTypes={certTypes} />
}
