import { createClient } from '@/lib/supabase/server'
import { certCan, loadTypes } from '@/lib/certifications.server'
import { CertTabs, PageHeader } from '@/components/certifications/cert-ui'
import { TypesTable } from '@/components/certifications/types-table'

export const metadata = { title: 'Certifications — HMM Champion' }

// Champions see the certification types their Gatekeepers can hold
// (Story 10.1 Sc05); only Super Admins can add or change them.
export default async function ChampionCertificationsPage() {
  const supabase = await createClient()
  const allowed = await certCan(supabase, 'certifications.types.view')
  const types = allowed ? await loadTypes(supabase) : []

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <PageHeader title="Certifications" description="The certification types your Gatekeepers can hold. Only Super Admins can add or change types." />
      <CertTabs current="types" base="/champion/certifications" showAudit={false} />
      {allowed
        ? <TypesTable types={types} holders={{}} manage={false} base="/champion/certifications" />
        : <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#64748B]">You don’t have permission to view certification types.</div>}
    </div>
  )
}
