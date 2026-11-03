import { createClient } from '@/lib/supabase/server'
import { waitingReviewCount } from '@/lib/certifications.server'
import { reviewFilterFrom } from '@/lib/self-reported'
import { CertTabs, PageHeader } from '@/components/certifications/cert-ui'
import { ReviewQueue } from '@/components/certifications/review-queue'

export const metadata = { title: 'Certification Reviews — HMM Champion' }

// Story 10.10: self-reported certifications of the Gatekeepers in the Champion's club.
export default async function ChampionReviewsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams
  const supabase = await createClient()
  const waiting = await waitingReviewCount(supabase)
  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <PageHeader title="Certifications" description="Review certifications your Gatekeepers have added themselves. Verified ones still don’t count as official certificates." />
      <CertTabs current="reviews" base="/champion/certifications" showAudit={false} reviews={waiting ?? 0} />
      <ReviewQueue portal="champion" filter={reviewFilterFrom(show)} />
    </div>
  )
}
