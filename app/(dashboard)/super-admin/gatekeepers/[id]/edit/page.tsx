import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GatekeeperEditForm } from './gatekeeper-edit-form'

export const metadata = { title: 'Edit Gatekeeper — HMM Super Admin' }

export default async function EditGatekeeperPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="flex justify-center p-8">
      <GatekeeperEditForm gatekeeper={gatekeeper} clubs={clubs ?? []} />
    </div>
  )
}
