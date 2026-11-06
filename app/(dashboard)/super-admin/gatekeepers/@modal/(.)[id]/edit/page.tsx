import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditGatekeeperModal } from './edit-gatekeeper-modal'

export default async function InterceptedEditGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: gatekeeper }, { data: clubs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, preferred_language, club_id, version')
      .eq('id', id)
      .eq('role', 'gatekeeper')
      .single(),
    supabase.from('clubs').select('id, name, club_code').eq('is_active', true).order('name'),
  ])

  if (!gatekeeper) notFound()

  return <EditGatekeeperModal gatekeeper={gatekeeper} clubs={clubs ?? []} />
}
