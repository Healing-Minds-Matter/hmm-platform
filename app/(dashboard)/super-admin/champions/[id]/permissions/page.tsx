import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChampionPermissionsCard } from './champion-permissions-card'
import { type EffectiveRow } from '@/app/(dashboard)/super-admin/permissions/effective/effective-permissions-table'

export const metadata = { title: 'Champion Permissions — HMM Super Admin' }

export default async function ChampionPermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: champion } = await supabase
    .from('profiles')
    .select('id, full_name, is_active')
    .eq('id', id)
    .eq('role', 'champion')
    .maybeSingle()

  if (!champion) notFound()

  const { data: rows, error } = await supabase.rpc('list_effective_permissions', { p_user_id: id })

  return (
    <div className="flex justify-center p-8">
      <ChampionPermissionsCard
        champion={champion}
        rows={(rows ?? []) as EffectiveRow[]}
        error={error ? "This person’s permissions couldn’t be loaded. Please refresh the page and try again." : undefined}
      />
    </div>
  )
}
