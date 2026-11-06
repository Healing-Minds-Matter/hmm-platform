import { notFound, redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { EditAnnouncementForm } from './edit-announcement-form'

export const metadata = { title: 'Edit Announcement — HMM Champion' }

export default async function EditChampionAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: announcement } = await supabase
    .from('announcements')
    .select('id, title, body, publish_date, expiry_date')
    .eq('id', id)
    .eq('created_by', user.id)
    .single()

  if (!announcement) notFound()

  return (
    <div className="flex justify-center p-8">
      <EditAnnouncementForm announcement={announcement} />
    </div>
  )
}
