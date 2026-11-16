import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'

// The sign-in email lives in two places: Supabase Auth (auth.users.email —
// what login actually checks) and public.profiles.email (what every page in
// this app displays). A self-service email change (requestEmailChangeAction)
// only updates auth.users, and only once the confirmation links are clicked
// — which can happen in any browser, even one with no session. So instead of
// relying on that one moment, the profile copy is re-synced from Auth
// whenever we next see the user (login, profile page, the confirmation
// callback). Idempotent: does nothing when the two already match.
export async function syncProfileEmail(userId: string, authEmail: string | undefined) {
  if (!authEmail) return

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()

  if (!profile || profile.email.toLowerCase() === authEmail.toLowerCase()) return

  const { error } = await admin.from('profiles').update({ email: authEmail }).eq('id', userId)
  if (error) {
    console.error('[syncProfileEmail] failed to update profiles.email', { code: error.code ?? null })
    return
  }

  await writeAuditLog({
    actorId: userId,
    action: 'auth.email_changed',
    entityType: 'user',
    entityId: userId,
    details: { from: profile.email, to: authEmail },
  })
}
