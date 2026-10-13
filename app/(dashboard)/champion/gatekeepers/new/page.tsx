import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateGatekeeperForm } from '@/app/(dashboard)/super-admin/gatekeepers/create-gatekeeper-form'

export const metadata = { title: 'Add Gatekeeper — HMM Champion' }

export default async function NewGatekeeperPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
      <CreateGatekeeperForm
        scope={{ mode: 'fixed', clubName: club?.name ?? 'Your Club' }}
        redirectPath="/champion/gatekeepers"
      />
    </div>
  )
}
