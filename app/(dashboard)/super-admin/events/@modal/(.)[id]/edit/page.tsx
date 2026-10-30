import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditEventModal } from '../../../edit-event-modal'
import { loadEventForEdit } from '../../../load-event-for-edit'

export default async function InterceptedEditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const props = await loadEventForEdit(id, user.id)
  if (!props) notFound()

  return <EditEventModal {...props} />
}
