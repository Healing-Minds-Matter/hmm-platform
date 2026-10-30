import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditEventForm } from '../../edit-event-form'
import { loadEventForEdit } from '../../load-event-for-edit'

export const metadata = { title: 'Edit Event — HMM Super Admin' }

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
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
