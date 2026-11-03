import { createClient } from '@/lib/supabase/server'
import { waitingReviewCount } from '@/lib/certifications.server'
import { reviewFilterFrom } from '@/lib/self-reported'
import { CertTabs, PageHeader } from '@/components/certifications/cert-ui'
import { ReviewQueue } from '@/components/certifications/review-queue'

export const metadata = { title: 'Certification Reviews — HMM Super Admin' }

// Story 10.10: everyone's self-reported certifications, including Champions'.
export default async function SuperAdminReviewsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams
  const supabase = await createClient()
  const waiting = await waitingReviewCount(supabase)
  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <PageHeader title="Certifications" description="Review certifications people have added themselves. Verified ones still don’t count as official certificates." />
      <CertTabs current="reviews" base="/super-admin/certifications" showAudit reviews={waiting ?? 0} />
      <ReviewQueue portal="super_admin" filter={reviewFilterFrom(show)} />
    </div>
  )
}
