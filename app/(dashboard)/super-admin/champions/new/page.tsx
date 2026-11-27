import { createClient } from '@/lib/supabase/server'
import { CreateChampionForm } from '../create-champion-form'

export const metadata = { title: 'Create Champion — HMM Super Admin' }

export default async function NewChampionPage() {
  const supabase = await createClient()
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <CreateChampionForm clubs={clubs ?? []} />
    </div>
  )
}
