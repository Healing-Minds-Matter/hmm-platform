import { createClient } from '@/lib/supabase/server'
import { awardableTypes } from '@/lib/certifications.server'
import { NewGatekeeperModal } from './new-gatekeeper-modal'

export default async function InterceptedNewGatekeeperPage() {
  const supabase = await createClient()
  const [{ data: clubs }, { data: champions }, certTypes] = await Promise.all([
    supabase.from('clubs').select('id, name, club_code').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name, club_id').eq('role', 'champion').eq('is_active', true),
    awardableTypes(supabase),
  ])

  return <NewGatekeeperModal clubs={clubs ?? []} champions={champions ?? []} certTypes={certTypes} />
}
