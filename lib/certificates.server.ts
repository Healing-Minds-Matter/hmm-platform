import 'server-only'
// Everything a profile's Certifications section needs (Stories 10.5–10.8,
// 10.11, 10.12 Sc02). Certificates, events and types are read with the
// signed-in user's client, so RLS decides what is visible; only the names of
// the people who added or removed them come from the admin client (a Champion
// can't read Super Admin profiles), and only for certificates already visible.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayDateString, isoToOrgDateTime } from '@/lib/org-date'
import { TYPE_COLUMNS, type CertificationTypeRow, type RetirementOption } from '@/lib/certification-types'
import { CERTIFICATE_COLUMNS, buildJourney, type CertificateEvent, type CertificateRow, type JourneyEntry } from '@/lib/certificates'
import { currentDesignVersions } from '@/lib/certificate-issue.server'
import { SELF_REPORTED_COLUMNS, type SelfReportedRow } from '@/lib/self-reported'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CertPermissions = {
  award: boolean; edit: boolean; remove: boolean; restore: boolean
  verify: boolean; reviewRemove: boolean   // reviewing this person's self-reported certifications
  self: boolean                            // this is the viewer's own profile and they may add their own
}

export type ProfileCertificates = {
  certs: CertificateRow[]
  selfReported: SelfReportedRow[]
  types: CertificationTypeRow[]
  journey: JourneyEntry[]
  names: Record<string, string>
  perms: CertPermissions
  designVersions: Record<string, number>
  today: string
}

export async function loadProfileCertificates(supabase: ServerClient, holderId: string): Promise<ProfileCertificates> {
  const today = todayDateString()
  const [{ data: certData }, { data: typeData }, { data: inScope }, { data: { user } }, ...can] = await Promise.all([
    supabase.from('certificate_statuses').select(CERTIFICATE_COLUMNS).eq('holder_id', holderId).order('achieved_on', { ascending: false }),
    supabase.from('certification_type_statuses').select(TYPE_COLUMNS).order('name'),
    supabase.rpc('cert_in_scope', { p_holder: holderId }),
    supabase.auth.getUser(),
    ...['certifications.award', 'certifications.official.edit', 'certifications.official.remove',
        'certifications.review.verify', 'certifications.review.remove', 'certifications.self.manage'].map(p =>
      supabase.rpc('cert_can', { p_permission: p })),
  ])
  const certs = (certData as CertificateRow[] | null) ?? []
  const types = (typeData as CertificationTypeRow[] | null) ?? []
  const ids = certs.map(c => c.id)
  const heldTypes = [...new Set(certs.map(c => c.type_id))]

  const [{ data: eventData }, { data: retData }, { data: me }, { data: selfData }] = await Promise.all([
    ids.length
      ? supabase.from('certificate_events').select('id, certificate_id, kind, actor_label, reason, changes, created_at').in('certificate_id', ids)
      : Promise.resolve({ data: [] }),
    heldTypes.length
      ? supabase.from('certification_type_retirements').select('id, type_id, retire_on, option, reactivated_on').in('type_id', heldTypes)
      : Promise.resolve({ data: [] }),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
    // Others never see what the holder withdrew (RLS).
    supabase.from('self_reported_certificates').select(SELF_REPORTED_COLUMNS).eq('holder_id', holderId).order('achieved_on', { ascending: false }),
  ])
  const selfReported = (selfData as SelfReportedRow[] | null) ?? []

  const peopleIds = [...new Set([...certs.flatMap(c => [c.added_by, c.removed_by]), ...selfReported.map(r => r.reviewed_by)]
    .filter((v): v is string => !!v))]
  const names: Record<string, string> = {}
  if (peopleIds.length) {
    const { data: people } = await createAdminClient().from('profiles').select('id, full_name, role').in('id', peopleIds)
    // With the role, as the stories ask for reviewers (“Verified by … with their role”).
    for (const p of people ?? []) names[p.id] = `${p.full_name} (${p.role === 'super_admin' ? 'Super Admin' : p.role === 'champion' ? 'Champion' : 'Gatekeeper'})`
  }

  const scoped = inScope === true
  const journey = buildJourney(
    certs,
    (eventData as CertificateEvent[] | null) ?? [],
    ((retData ?? []) as { id: string; type_id: string; retire_on: string; option: RetirementOption; reactivated_on: string | null }[]),
    today,
    iso => isoToOrgDateTime(iso).date,
    selfReported,
  )
  return {
    certs, selfReported, types, journey, names, today,
    designVersions: await currentDesignVersions(types.filter(t => t.status !== 'retired' || certs.some(c => c.type_id === t.id)).map(t => t.id)),
    perms: {
      award: scoped && can[0].data === true,
      edit: scoped && can[1].data === true,
      remove: scoped && can[2].data === true,
      restore: scoped && me?.role === 'super_admin',
      verify: scoped && can[3].data === true,
      reviewRemove: scoped && can[4].data === true,
      self: user?.id === holderId && can[5].data === true,
    },
  }
}
