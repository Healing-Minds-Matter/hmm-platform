import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReactivateGatekeeperForm } from './reactivate-gatekeeper-form'

export const metadata = { title: 'Reactivate Gatekeeper — HMM Super Admin' }

export default async function ReactivateGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: gatekeeper }, { data: clubs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, club_id, is_active, clubs!profiles_club_id_fkey(id, name, is_active)')
      .eq('id', id)
      .eq('role', 'gatekeeper')
      .single(),
    supabase.from('clubs').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!gatekeeper) notFound()
  if (gatekeeper.is_active) {
    return (
      <div className="p-8 max-sm:p-4">
        <p className="text-sm text-gray-600">This gatekeeper is already active.</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentClub = gatekeeper.clubs as any

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <ReactivateGatekeeperForm
        gatekeeper={{ id: gatekeeper.id, full_name: gatekeeper.full_name, email: gatekeeper.email, club_id: gatekeeper.club_id }}
        currentClub={currentClub}
        activeClubs={clubs ?? []}
      />
    </div>
  )
}
