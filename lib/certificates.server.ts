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

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CertPermissions = { award: boolean; edit: boolean; remove: boolean; restore: boolean }

export type ProfileCertificates = {
  certs: CertificateRow[]
  types: CertificationTypeRow[]
  journey: JourneyEntry[]
  names: Record<string, string>
  perms: CertPermissions
  today: string
}

export async function loadProfileCertificates(supabase: ServerClient, holderId: string): Promise<ProfileCertificates> {
  const today = todayDateString()
  const [{ data: certData }, { data: typeData }, { data: inScope }, { data: { user } }, ...can] = await Promise.all([
    supabase.from('certificate_statuses').select(CERTIFICATE_COLUMNS).eq('holder_id', holderId).order('achieved_on', { ascending: false }),
    supabase.from('certification_type_statuses').select(TYPE_COLUMNS).order('name'),
    supabase.rpc('cert_in_scope', { p_holder: holderId }),
    supabase.auth.getUser(),
    ...['certifications.award', 'certifications.official.edit', 'certifications.official.remove'].map(p =>
      supabase.rpc('cert_can', { p_permission: p })),
  ])
  const certs = (certData as CertificateRow[] | null) ?? []
  const types = (typeData as CertificationTypeRow[] | null) ?? []
  const ids = certs.map(c => c.id)
  const heldTypes = [...new Set(certs.map(c => c.type_id))]

  const [{ data: eventData }, { data: retData }, { data: me }] = await Promise.all([
    ids.length
      ? supabase.from('certificate_events').select('id, certificate_id, kind, actor_label, reason, changes, created_at').in('certificate_id', ids)
      : Promise.resolve({ data: [] }),
    heldTypes.length
      ? supabase.from('certification_type_retirements').select('id, type_id, retire_on, option, reactivated_on').in('type_id', heldTypes)
      : Promise.resolve({ data: [] }),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const peopleIds = [...new Set(certs.flatMap(c => [c.added_by, c.removed_by]).filter((v): v is string => !!v))]
  const names: Record<string, string> = {}
  if (peopleIds.length) {
    const { data: people } = await createAdminClient().from('profiles').select('id, full_name').in('id', peopleIds)
    for (const p of people ?? []) names[p.id] = p.full_name
  }

  const scoped = inScope === true
  const journey = buildJourney(
    certs,
    (eventData as CertificateEvent[] | null) ?? [],
    ((retData ?? []) as { id: string; type_id: string; retire_on: string; option: RetirementOption; reactivated_on: string | null }[]),
    today,
    iso => isoToOrgDateTime(iso).date,
  )
  return {
    certs, types, journey, names, today,
    perms: {
      award: scoped && can[0].data === true,
      edit: scoped && can[1].data === true,
      remove: scoped && can[2].data === true,
      restore: scoped && me?.role === 'super_admin',
    },
  }
}
