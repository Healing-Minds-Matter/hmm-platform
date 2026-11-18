import { notFound, redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { hasSignedIn } from '@/lib/account-setup.server'
import { EditGatekeeperModal } from './edit-gatekeeper-modal'

export default async function InterceptedEditGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', user.id)
    .single()
  if (!callerProfile?.club_id) return null

  const { data: gatekeeper } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, preferred_language, club_id, version')
    .eq('id', id)
    .eq('role', 'gatekeeper')
    .eq('club_id', callerProfile.club_id)
    .single()

  if (!gatekeeper) notFound()

  // Review Finding 2: a Champion may only fix the email before the Gatekeeper first signs in.
  const emailLocked = await hasSignedIn(id).catch(() => true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = callerProfile.clubs as any

  return <EditGatekeeperModal gatekeeper={gatekeeper} clubName={club?.name ?? 'Your Club'} emailLocked={emailLocked} />
}
