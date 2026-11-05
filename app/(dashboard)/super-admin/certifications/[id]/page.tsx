import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadRetirements, loadType, typeImpact } from '@/lib/certifications.server'
import { formatCertDate, retirementEffect, validityLabel } from '@/lib/certification-types'
import { formatOrgDate } from '@/lib/org-date'
import { Badge, Card, Code, Facts, PrimaryLink, SecondaryLink, TypeStatusBadge } from '@/components/certifications/cert-ui'
import { placeholderValues, sampleValues } from '@/lib/certificate-design'
import { loadDesignVersions, signedAssetUrls } from '@/lib/designs.server'
import { CertificatePreview } from '@/components/certifications/certificate-preview'
import { DesignVersions } from '@/components/certifications/design-versions'

export const metadata = { title: 'Certification type — HMM Super Admin' }

// A certification type's page (Story 10.1 Sc06): details, and its retirement
// only when one has been set (Story 10.2), and its digital certificate design
// with every saved version (Story 10.4).
export default async function CertificationTypePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ design_saved?: string }>
}) {
  const { id } = await params
  const { design_saved } = await searchParams
  const supabase = await createClient()
  const type = await loadType(supabase, id)
  if (!type) notFound()

  const [impact, retirements, { count: awarded }, versions] = await Promise.all([
    typeImpact(supabase, id),
    loadRetirements(supabase, id),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('type_id', id),
    loadDesignVersions(supabase, id),
  ])
  const assets = await signedAssetUrls(versions.map(v => v.design))
  const sample = sampleValues(type)
  const currentDesign = versions[0] ?? null
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

      {design_saved && (
        <div role="status" className="rounded-lg bg-[#E6FFE7] px-4 py-2.5 text-[13px] font-medium text-[#0D8275]">
          Design saved as version {design_saved}. New digital certificates of {type.name} use it from now on.
        </div>
      )}

      <section className="rounded-2xl bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A]">Digital certificate design</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-[#64748B]">
              {currentDesign
                ? `Current version: ${currentDesign.version}. Certificates already issued keep the version they were made with.`
                : `No design yet. Without one, certificates of ${type.name} can only be recorded as physical.`}
            </p>
          </div>
          {!retired && <PrimaryLink href={`${base}/design`}>{currentDesign ? 'Edit design' : '+ Create design'}</PrimaryLink>}
        </div>
        {retired && (
          <div className="mt-4 rounded-lg bg-[#FFFBEB] px-4 py-3 text-[13px] text-[#B45309]">
            <b>Retired type: designs can’t be created or edited.</b> Existing versions can still be viewed, and issued certificates can still be downloaded. Reactivate the type to change its design.
          </div>
        )}
        {currentDesign && (
          <div className="mt-4 grid place-items-center rounded-2xl bg-[#E2E8F0]/60 p-4">
            <CertificatePreview design={currentDesign.design} values={sample} assets={assets} maxWidth={560} />
          </div>
        )}
      </section>

      {versions.length > 0 && (
        <DesignVersions typeId={id} versions={versions} assets={assets} sample={sample} placeholders={placeholderValues(true)} canEdit={!retired} />
      )}

      {past.length > 0 && (
        <Card title="Retirement history">
          <ul className="flex flex-col gap-2 text-[13px] text-[#0F172A]">
            {past.map(r => (
              <li key={r.id}>
                {r.reactivated_on! < r.retire_on
                  ? <>Retirement planned for {formatCertDate(r.retire_on)} was cancelled{r.reactivated_by_name ? ` by ${r.reactivated_by_name}` : ''}.</>
                  : r.reactivated_on === r.retire_on
                  ? <>Retired and reactivated on the same day ({formatCertDate(r.retire_on)}), so the retirement was cancelled and no certificates stayed stopped{r.reactivated_by_name ? ` (${r.reactivated_by_name})` : ''}.</>
                  : <>Retired {formatCertDate(r.retire_on)} ({r.option === 'stop' ? 'certificates stopped' : 'certificates kept valid'}); offered again from {formatCertDate(r.reactivated_on)}{r.reactivated_by_name ? `, by ${r.reactivated_by_name}` : ''}.</>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
