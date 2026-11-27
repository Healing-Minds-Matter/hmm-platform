import { createClient } from '@/lib/supabase/server'
import { CreateEventForm } from '../create-event-form'

export const metadata = { title: 'Schedule Event — HMM Super Admin' }

export default async function NewEventPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clubs').select('id, name').eq('is_active', true).order('name')

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <CreateEventForm clubs={data ?? []} />
    </div>
  )
}
