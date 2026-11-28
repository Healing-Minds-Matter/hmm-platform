import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReactivateChampionForm } from './reactivate-champion-form'

export const metadata = { title: 'Reactivate Champion — HMM Super Admin' }

export default async function ReactivateChampionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: champion }, { data: clubs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, club_id, is_active, clubs!profiles_club_id_fkey(id, name, is_active)')
      .eq('id', id)
      .eq('role', 'champion')
      .single(),
    supabase
      .from('clubs')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  if (!champion) notFound()
  if (champion.is_active) {
    return (
      <div className="p-8 max-sm:p-4">
        <p className="text-sm text-gray-600">This champion is already active.</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentClub = champion.clubs as any

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <ReactivateChampionForm
        champion={{ id: champion.id, full_name: champion.full_name, email: champion.email, club_id: champion.club_id }}
        currentClub={currentClub}
        activeClubs={clubs ?? []}
      />
    </div>
  )
}
