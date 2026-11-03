import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GatekeeperEditForm } from './gatekeeper-edit-form'

export const metadata = { title: 'Edit Gatekeeper — HMM Champion' }

export default async function EditGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', user.id)
    .single()
  if (!callerProfile?.club_id) redirect('/champion')

  const { data: gatekeeper } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, preferred_language, club_id, version')
    .eq('id', id)
    .eq('role', 'gatekeeper')
    .eq('club_id', callerProfile.club_id)
    .single()

  if (!gatekeeper) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = callerProfile.clubs as any

  return (
    <div className="flex justify-center p-8">
      <GatekeeperEditForm gatekeeper={gatekeeper} clubName={club?.name ?? 'Your Club'} />
    </div>
  )
}
