// Server wrapper for a profile's Certifications section: loads the person's
// certificates, journey and the viewer's permissions, then hands them to the
// client panel. Used on the Gatekeeper and Champion detail pages.
import { createClient } from '@/lib/supabase/server'
import { loadProfileCertificates } from '@/lib/certificates.server'
import { CertificatesPanel } from '@/components/certifications/certificates-panel'

export async function CertificatesSection({ holderId, holderName }: { holderId: string; holderName: string }) {
  const supabase = await createClient()
  const data = await loadProfileCertificates(supabase, holderId)
  return <CertificatesPanel holderId={holderId} holderName={holderName} {...data} />
}
