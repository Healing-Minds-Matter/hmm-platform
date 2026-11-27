import { createClient } from '@/lib/supabase/server'
import { CreateAnnouncementForm } from '../create-announcement-form'

export const metadata = { title: 'Create Announcement — HMM Super Admin' }

export default async function NewAnnouncementPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('clubs').select('id, name').eq('is_active', true).order('name')

  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <CreateAnnouncementForm clubs={data ?? []} />
    </div>
  )
}
