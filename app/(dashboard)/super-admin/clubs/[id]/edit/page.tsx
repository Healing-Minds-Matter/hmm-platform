import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClubEditForm } from './club-edit-form'

export default async function EditClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, club_code, name, location, description, contact_email, contact_phone, is_active')
    .eq('id', id)
    .single()

  if (!club) notFound()

  return (
    <div className="p-8 max-sm:p-4">
      <ClubEditForm club={club} />
    </div>
  )
}
