import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadType, typeImpact } from '@/lib/certifications.server'

// What the Edit / Retire / Reactivate forms need, for both the pop-up and the full page.
export async function loadTypeForForm(id: string) {
  const supabase = await createClient()
  const type = await loadType(supabase, id)
  if (!type) notFound()
  const [{ count }, impact] = await Promise.all([
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('type_id', id),
    typeImpact(supabase, id),
  ])
  return { type, codeLocked: (count ?? 0) > 0, impact }
}
