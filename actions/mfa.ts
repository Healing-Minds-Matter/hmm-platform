'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { currentAssuranceLevel } from '@/lib/auth/mfa'

// Review Finding 8: records a newly set-up authenticator in the audit log.
// Called by the verification page after the first code is accepted. Nothing
// from the browser is trusted: the server reads the caller's own verified
// factors from Supabase, requires a verified (aal2) session, and writes one
// entry per factor — only when that factor hasn't been recorded before.
export async function recordMfaEnrolledAction(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if ((await currentAssuranceLevel(supabase)) !== 'aal2') return

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = (factors?.totp ?? []).filter(f => f.status === 'verified')
  if (!verified.length) return

  const admin = createAdminClient()
  const { data: logged } = await admin
    .from('audit_logs')
    .select('details')
    .eq('action', 'auth.mfa_enrolled')
    .eq('entity_id', user.id)
  const known = new Set((logged ?? []).map(r => (r.details as { factor_id?: string } | null)?.factor_id))

  for (const factor of verified) {
    if (known.has(factor.id)) continue
    await writeAuditLog({
      actorId: user.id,
      action: 'auth.mfa_enrolled',
      entityType: 'user',
      entityId: user.id,
      details: { factor_id: factor.id, factor_type: 'totp' },
    })
  }
}
