import { createClient } from '@/lib/supabase/server'
import { holderCounts, loadTypes } from '@/lib/certifications.server'
import { CertTabs, PageHeader, PrimaryLink } from '@/components/certifications/cert-ui'
import { TypesTable } from '@/components/certifications/types-table'

export const metadata = { title: 'Certifications — HMM Super Admin' }

export default async function CertificationsPage() {
  const supabase = await createClient()
  const [types, holders] = await Promise.all([loadTypes(supabase), holderCounts(supabase)])

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <PageHeader
        title="Certifications"
        description="Every certification HMM recognises. Nothing is built in: QPR is an ordinary type, created from the existing certification dates."
        action={
          <PrimaryLink href="/super-admin/certifications/new">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
            New certification type
          </PrimaryLink>
        }
      />
      <CertTabs current="types" base="/super-admin/certifications" showAudit />
      <TypesTable types={types} holders={holders} manage base="/super-admin/certifications" />
    </div>
  )
}
