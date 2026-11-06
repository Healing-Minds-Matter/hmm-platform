import 'server-only'
// Data loading for the Certifications screens (Epic 10). Uses the signed-in
// user's client, so each person only gets what the database lets them see.
import { createClient } from '@/lib/supabase/server'
import { TYPE_COLUMNS, programmeEnded, type CertificationTypeRow, type IssuedFacts, type RetirementOption } from '@/lib/certification-types'
import { todayDateString } from '@/lib/org-date'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export async function loadTypes(supabase: ServerClient): Promise<CertificationTypeRow[]> {
  const { data } = await supabase.from('certification_type_statuses').select(TYPE_COLUMNS).order('name')
  return (data as CertificationTypeRow[] | null) ?? []
}

export async function loadType(supabase: ServerClient, id: string): Promise<CertificationTypeRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabase.from('certification_type_statuses').select(TYPE_COLUMNS).eq('id', id).maybeSingle()
  return (data as CertificationTypeRow | null) ?? null
}

// People holding a current (not removed, not renewed) certificate, per type.
export async function holderCounts(supabase: ServerClient): Promise<Record<string, number>> {
  const { data } = await supabase.from('certificate_statuses').select('type_id').eq('is_current', true)
  const counts: Record<string, number> = {}
  for (const row of data ?? []) counts[row.type_id] = (counts[row.type_id] ?? 0) + 1
  return counts
}

// For editing a type: every certificate ever issued for it (removed included), how
// many people they went to, and the latest date achieved (the earliest Offered until).
export async function typeIssuedFacts(supabase: ServerClient, typeId: string): Promise<IssuedFacts> {
  const { data } = await supabase.from('certificates').select('holder_id, achieved_on').eq('type_id', typeId)
  const rows = data ?? []
  return {
    certificates: rows.length,
    people: new Set(rows.map(r => r.holder_id)).size,
    latestAchievedOn: rows.reduce<string | null>((max, r) => (!max || r.achieved_on > max ? r.achieved_on : max), null),
  }
}

// For the retire / reactivate pop-ups: how many people hold the type, how many
// of those certificates are valid now, and how many were stopped by a retirement.
export async function typeImpact(supabase: ServerClient, typeId: string) {
  const { data } = await supabase.from('certificate_statuses').select('status, stopped_on').eq('type_id', typeId).eq('is_current', true)
  const rows = data ?? []
  return {
    holders: rows.length,
    validNow: rows.filter(r => r.status === 'valid' || r.status === 'expiring_soon').length,
    stopped: rows.filter(r => r.stopped_on).length,
  }
}

export type RetirementRecord = {
  id: string
  retire_on: string
  option: RetirementOption
  chosen_at: string
  reactivated_on: string | null
  chosen_by_name: string | null
  reactivated_by_name: string | null
}

export async function loadRetirements(supabase: ServerClient, typeId: string): Promise<RetirementRecord[]> {
  const { data } = await supabase
    .from('certification_type_retirements')
    .select('id, retire_on, option, chosen_at, reactivated_on, chosen_by:profiles!certification_type_retirements_chosen_by_fkey(full_name), reactivated_by:profiles!certification_type_retirements_reactivated_by_fkey(full_name)')
    .eq('type_id', typeId)
    .order('chosen_at', { ascending: false })
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { full_name?: string } | null
  return (data ?? []).map(r => ({
    id: r.id, retire_on: r.retire_on, option: r.option as RetirementOption, chosen_at: r.chosen_at, reactivated_on: r.reactivated_on,
    chosen_by_name: one(r.chosen_by)?.full_name ?? null,
    reactivated_by_name: one(r.reactivated_by)?.full_name ?? null,
  }))
}

export async function isSuperAdmin(supabase: ServerClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'super_admin'
}

// Self-reported certifications waiting for review by this user (not their own),
// or null when they may not review at all.
export async function waitingReviewCount(supabase: ServerClient): Promise<number | null> {
  if (!(await certCan(supabase, 'certifications.review.view'))) return null
  const { data: { user } } = await supabase.auth.getUser()
  const { count } = await supabase.from('self_reported_certificates').select('id', { count: 'exact', head: true })
    .eq('state', 'unverified').neq('holder_id', user?.id ?? '')
  return count ?? 0
}

export async function certCan(supabase: ServerClient, permission: string): Promise<boolean> {
  const { data } = await supabase.rpc('cert_can', { p_permission: permission })
  return data === true
}

export type AwardableType = Pick<CertificationTypeRow, 'id' | 'name' | 'code' | 'offered_from' | 'offered_until' | 'validity_value' | 'validity_unit'>

// Types the signed-in user can add to people (for the Add Gatekeeper form),
// or null when they may not add certificates at all. Leaves out retired types and
// programmes whose Offered until has passed.
export async function awardableTypes(supabase: ServerClient): Promise<AwardableType[] | null> {
  if (!(await certCan(supabase, 'certifications.award'))) return null
  const today = todayDateString()
  return (await loadTypes(supabase))
    .filter(t => t.status !== 'retired' && !programmeEnded(t, today))
    .map(({ id, name, code, offered_from, offered_until, validity_value, validity_unit }) => ({ id, name, code, offered_from, offered_until, validity_value, validity_unit }))
}
