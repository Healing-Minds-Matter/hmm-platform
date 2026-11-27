import { createClient } from '@/lib/supabase/server'
import { NewDelegationForm } from './new-delegation-form'

export const metadata = { title: 'Create Delegation — HMM Super Admin' }

export default async function NewDelegationPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['champion', 'gatekeeper'])
    .eq('is_active', true)
    .order('full_name')

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <NewDelegationForm users={users ?? []} />
    </div>
  )
}
