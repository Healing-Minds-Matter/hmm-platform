import 'server-only'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadType, typeImpact, typeIssuedFacts } from '@/lib/certifications.server'

// What the Edit / Retire / Reactivate forms need, for both the pop-up and the full page.
export async function loadTypeForForm(id: string) {
  const supabase = await createClient()
  const type = await loadType(supabase, id)
  if (!type) notFound()
  const [issued, impact] = await Promise.all([typeIssuedFacts(supabase, id), typeImpact(supabase, id)])
  return { type, issued, impact }
}
