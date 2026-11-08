import { createClient } from '@/lib/supabase/server'
import { NewExceptionForm } from './new-exception-form'

export const metadata = { title: 'Grant Individual Exception — HMM Super Admin' }

export default async function NewExceptionPage() {
  const supabase = await createClient()

  const [{ data: users }, { data: permissions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['champion', 'gatekeeper'])
      .eq('is_active', true)
      .order('full_name'),
    // The same catalog and labels as the Permissions screens (sheet row 60).
    supabase
      .from('permission_catalog')
      .select('key, label, category, restricted_to')
      .order('category')
      .order('display_order'),
  ])

  return (
    <div className="flex justify-center p-8">
      <NewExceptionForm users={users ?? []} permissions={permissions ?? []} />
    </div>
  )
}
