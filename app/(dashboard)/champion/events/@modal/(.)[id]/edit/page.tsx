import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditEventModal } from '@/app/(dashboard)/super-admin/events/edit-event-modal'
import { loadEventForEdit } from '@/app/(dashboard)/super-admin/events/load-event-for-edit'

export default async function InterceptedEditChampionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const props = await loadEventForEdit(id, user.id)
  if (!props) notFound()

  return <EditEventModal {...props} />
}
