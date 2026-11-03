import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadRetirements, loadType, typeImpact } from '@/lib/certifications.server'
import { formatCertDate, retirementEffect, validityLabel } from '@/lib/certification-types'
import { formatOrgDate } from '@/lib/org-date'
import { Badge, Card, Code, Facts, SecondaryLink, TypeStatusBadge } from '@/components/certifications/cert-ui'

export const metadata = { title: 'Certification type — HMM Super Admin' }

// A certification type's page (Story 10.1 Sc06): details, and its retirement
// only when one has been set (Story 10.2). Its digital certificate design is
// added here in a later phase (Story 10.4).
export default async function CertificationTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const type = await loadType(supabase, id)
  if (!type) notFound()

  const [impact, retirements, { count: awarded }] = await Promise.all([
    typeImpact(supabase, id),
    loadRetirements(supabase, id),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('type_id', id),
  ])
  const open = retirements.find(r => r.id === type.open_retirement_id) ?? null
  const past = retirements.filter(r => r.reactivated_on)
  const retired = type.status === 'retired'
  const lifetime = type.validity_value == null
  const base = `/super-admin/certifications/${id}`

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <div className="text-[13px] text-[#64748B]">
        <Link href="/super-admin/certifications" className="hover:text-[#022C51]">Certifications</Link> / {type.name}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">{type.name}</h1>
            <Code>{type.code}</Code>
            <TypeStatusBadge type={type} />
          </div>
          {type.description && <p className="mt-1 max-w-3xl text-sm text-[#475569]">{type.description}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <SecondaryLink href={`${base}/edit`}>Edit</SecondaryLink>
          {retired
            ? <Link href={`${base}/reactivate`} className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-4 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E09B0F]">Reactivate type</Link>
            : !open && <SecondaryLink href={`${base}/retire`} danger>Retire type</SecondaryLink>}
        </div>
      </div>

      <div className={open ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : 'max-w-3xl'}>
        <Card title="Details">
          <Facts rows={[
            ['Issuing body', type.issuing_body || '—'],
            ['Validity', validityLabel(type)],
            ['Offered', `From ${formatCertDate(type.offered_from)}${type.offered_until ? ` until ${formatCertDate(type.offered_until)}` : ', no end date'}`],
            ['Code', <span key="c"><Code>{type.code}</Code> <span className="text-[12px] text-[#64748B]">{(awarded ?? 0) > 0 ? 'Can’t be changed: already awarded.' : 'Can still be changed.'}</span></span>],
            ['Holders', `${impact.holders} ${impact.holders === 1 ? 'person' : 'people'}`],
          ]} />
        </Card>

        {open && (
          <Card title="Retirement" action={<Badge tone={retired ? 'grey' : 'warn'}>{retired ? 'Retired' : 'Scheduled'}</Badge>}>
            <Facts rows={[
              ['Retirement date', formatCertDate(open.retire_on)],
              ['Existing certificates', retirementEffect(open.option, lifetime)],
              ['People affected', String(impact.holders)],
              ['Chosen by', `${open.chosen_by_name ?? 'System'}, ${formatOrgDate(open.chosen_at, { day: 'numeric', month: 'short', year: 'numeric' })}`],
            ]} />
            <div className="mt-5"><SecondaryLink href={`${base}/retire`}>Change retirement</SecondaryLink></div>
          </Card>
        )}
      </div>

      {past.length > 0 && (
        <Card title="Retirement history">
          <ul className="flex flex-col gap-2 text-[13px] text-[#0F172A]">
            {past.map(r => (
              <li key={r.id}>
                {r.reactivated_on! < r.retire_on
                  ? <>Retirement planned for {formatCertDate(r.retire_on)} was cancelled{r.reactivated_by_name ? ` by ${r.reactivated_by_name}` : ''}.</>
                  : r.reactivated_on === r.retire_on
                  ? <>Retired and reactivated on {formatCertDate(r.retire_on)}, so no certificates were affected{r.reactivated_by_name ? ` (${r.reactivated_by_name})` : ''}.</>
                  : <>Retired {formatCertDate(r.retire_on)} ({r.option === 'stop' ? 'certificates stopped' : 'certificates kept valid'}); offered again from {formatCertDate(r.reactivated_on)}{r.reactivated_by_name ? `, by ${r.reactivated_by_name}` : ''}.</>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
