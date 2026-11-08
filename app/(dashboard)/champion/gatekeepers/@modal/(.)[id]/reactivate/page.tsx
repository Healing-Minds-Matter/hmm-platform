import { notFound, redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { ReactivateGatekeeperModal } from './reactivate-gatekeeper-modal'

export default async function InterceptedReactivateGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(id, name, is_active)')
    .eq('id', user.id)
    .single()
  if (!callerProfile?.club_id) return null

  const { data: gatekeeper } = await supabase
    .from('profiles')
    .select('id, full_name, email, club_id, is_active')
    .eq('id', id)
    .eq('role', 'gatekeeper')
    .eq('club_id', callerProfile.club_id)
    .single()

  if (!gatekeeper) notFound()
  if (gatekeeper.is_active) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownClub = callerProfile.clubs as any

  return (
    <ReactivateGatekeeperModal
      gatekeeper={{ id: gatekeeper.id, full_name: gatekeeper.full_name, email: gatekeeper.email, club_id: gatekeeper.club_id }}
      currentClub={ownClub}
      activeClubs={ownClub ? [ownClub] : []}
    />
  )
}
