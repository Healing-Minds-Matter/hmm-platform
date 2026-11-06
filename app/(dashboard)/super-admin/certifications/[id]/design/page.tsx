import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { certCan, loadType } from '@/lib/certifications.server'
import { defaultDesign, editStartLabel, placeholderValues, sampleValues } from '@/lib/certificate-design'
import { loadDesignVersions, signedAssetUrls } from '@/lib/designs.server'
import { CertificateDesigner } from '@/components/certifications/certificate-designer'
import { DesignVersions } from '@/components/certifications/design-versions'

export const metadata = { title: 'Certificate design — HMM Super Admin' }

// Story 10.3: the designer, starting from the current version, a copy of an
// older one (?from=N, Story 10.4 Sc04), or a default layout for a new design.
export default async function CertificateDesignPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const supabase = await createClient()
  const type = await loadType(supabase, id)
  if (!type) notFound()
  const allowed = await certCan(supabase, 'certifications.design.manage')
  const crumbs = (
    <div className="text-[13px] text-[#64748B]">
      <Link href="/super-admin/certifications" className="hover:text-[#022C51]">Certifications</Link> /{' '}
      <Link href={`/super-admin/certifications/${id}`} className="hover:text-[#022C51]">{type.name}</Link> / Digital certificate design
    </div>
  )
  const blocked = !allowed
    ? 'Only Super Admins can design certificates.'
    : type.status === 'retired' ? `${type.name} is retired. Its certificate design can’t be created or edited until the type is reactivated.` : null
  if (blocked) {
    return (
      <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
        {crumbs}
        <div className="rounded-xl bg-[#FFFBEB] px-5 py-4 text-sm text-[#B45309]">{blocked}</div>
      </div>
    )
  }

  const versions = await loadDesignVersions(supabase, id)
  const current = versions[0] ?? null
  const fromVersion = from ? versions.find(v => v.version === Number(from)) ?? null : null
  const startFrom = fromVersion ?? current
  const start = startFrom?.design ?? { ...defaultDesign(), items: defaultDesign().items }
  const startLabel = editStartLabel(current?.version ?? null, startFrom?.version ?? null)
  const assets = await signedAssetUrls(versions.map(v => v.design))
  const sample = sampleValues(type)

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      {crumbs}
      <CertificateDesigner
        key={startFrom?.version ?? 0}
        typeId={id}
        typeName={type.name}
        lifetime={type.validity_value == null}
        start={start}
        startLabel={startLabel}
        nextVersion={(current?.version ?? 0) + 1}
        assets={assets}
        sample={sample}
        placeholders={placeholderValues(true)}
      />
      <DesignVersions typeId={id} versions={versions} assets={assets} sample={sample} placeholders={placeholderValues(true)}
        canEdit editingFrom={startFrom?.version ?? null} />
    </div>
  )
}
