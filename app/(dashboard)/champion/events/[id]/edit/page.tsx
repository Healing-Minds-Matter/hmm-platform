import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditEventForm } from '@/app/(dashboard)/super-admin/events/edit-event-form'
import { loadEventForEdit } from '@/app/(dashboard)/super-admin/events/load-event-for-edit'

export const metadata = { title: 'Edit Event — HMM Champion' }

export default async function EditChampionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const props = await loadEventForEdit(id, user.id)
  if (!props) notFound()

  return (
    <div className="flex justify-center p-8">
      <EditEventForm {...props} />
    </div>
  )
}
