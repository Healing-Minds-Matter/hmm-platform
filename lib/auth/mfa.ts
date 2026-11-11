import type { SupabaseClient } from '@supabase/supabase-js'

// Review Finding 8: Super Admins sign in with their password AND a code from
// an authenticator app (Supabase MFA, TOTP). A session that has passed both
// is "aal2". The database refuses a Super Admin whose session isn't (see
// migration 20261113000004); the web sends them to MFA_PATH first.
// No UI or Next.js code here: used by middleware and the guards.

export const MFA_PATH = '/mfa'

/** The session's assurance level, or null if it can't be read (treated as not verified). */
export async function currentAssuranceLevel(supabase: Pick<SupabaseClient, 'auth'>): Promise<'aal1' | 'aal2' | null> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) return null
    return data?.currentLevel === 'aal2' ? 'aal2' : data?.currentLevel === 'aal1' ? 'aal1' : null
  } catch {
    return null
  }
}

/** Roles that must verify with an authenticator code. */
export function roleNeedsMfa(role: string | null | undefined): boolean {
  return role === 'super_admin'
}
