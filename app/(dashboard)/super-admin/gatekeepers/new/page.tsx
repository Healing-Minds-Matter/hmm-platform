import { createClient } from '@/lib/supabase/server'
import { CreateGatekeeperForm } from '../create-gatekeeper-form'

export const metadata = { title: 'Add Gatekeeper — HMM Super Admin' }

export default async function NewGatekeeperPage() {
  const supabase = await createClient()
  const [{ data: clubs }, { data: champions }] = await Promise.all([
    supabase.from('clubs').select('id, name, club_code').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name, club_id').eq('role', 'champion').eq('is_active', true),
  ])

  return (
    <div className="flex justify-center p-8">
      <CreateGatekeeperForm
        scope={{ mode: 'select', clubs: clubs ?? [], champions: champions ?? [] }}
        redirectPath="/super-admin/gatekeepers"
      />
    </div>
  )
}
