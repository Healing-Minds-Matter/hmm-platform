import 'server-only'
// Current certificates for lists and dashboards (Story 10.12), read with the
// signed-in user's client so RLS scopes them (Super Admins: everyone;
// Champions: their own club's Gatekeepers and themselves).

import { createClient } from '@/lib/supabase/server'
import { CURRENT_CERT_COLUMNS, byHolder, type CurrentCert } from '@/lib/cert-summary'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CertSummary = {
  byHolder: Map<string, CurrentCert[]>
  types: { id: string; name: string; code: string; status: string }[]   // types that appear, plus all active ones, by name
}

export async function loadCertSummary(supabase: ServerClient): Promise<CertSummary> {
  const [{ data: rows }, { data: types }] = await Promise.all([
    supabase.from('certificate_statuses').select(CURRENT_CERT_COLUMNS).eq('is_current', true).is('removed_at', null),
    supabase.from('certification_type_statuses').select('id, name, code, status').order('name'),
  ])
  const certs = (rows as CurrentCert[] | null) ?? []
  const held = new Set(certs.map(c => c.type_id))
  return {
    byHolder: byHolder(certs),
    types: (types ?? []).filter(t => t.status !== 'retired' || held.has(t.id)).map(({ id, name, code, status }) => ({ id, name, code, status })),
  }
}
