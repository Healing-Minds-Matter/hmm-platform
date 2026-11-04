import 'server-only'
// Current certificates for lists and dashboards (Story 10.12), read with the
// signed-in user's client so RLS scopes them (Super Admins: everyone;
// Champions: their own club's Gatekeepers and themselves).

import { createClient } from '@/lib/supabase/server'
import { CURRENT_CERT_COLUMNS, byHolder, type CurrentCert } from '@/lib/cert-summary'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CertSummary = {
  byHolder: Map<string, CurrentCert[]>
  qprByHolder: Map<string, CurrentCert>
  types: { id: string; name: string; code: string; status: string }[]   // types that appear, plus all active ones, by name
  qprTypeId: string | null
}

export async function loadCertSummary(supabase: ServerClient): Promise<CertSummary> {
  const [{ data: rows }, { data: types }] = await Promise.all([
    supabase.from('certificate_statuses').select(CURRENT_CERT_COLUMNS).eq('is_current', true).is('removed_at', null),
    supabase.from('certification_type_statuses').select('id, name, code, status').order('name'),
  ])
  const certs = (rows as CurrentCert[] | null) ?? []
  const qprTypeId = (types ?? []).find(t => t.code === 'QPR')?.id ?? null
  const held = new Set(certs.map(c => c.type_id))
  const grouped = byHolder(certs)
  const qprByHolder = new Map<string, CurrentCert>()
  if (qprTypeId) for (const c of certs) if (c.type_id === qprTypeId) qprByHolder.set(c.holder_id, c)
  return {
    byHolder: grouped,
    qprByHolder,
    types: (types ?? []).filter(t => t.status !== 'retired' || held.has(t.id)).map(({ id, name, code, status }) => ({ id, name, code, status })),
    qprTypeId,
  }
}
