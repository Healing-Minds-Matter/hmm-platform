import type { SupabaseClient } from '@supabase/supabase-js'

// The signed-in caller's own account status, from the database function
// my_account_status() (migration 20261112000001). It's the one thing a
// deactivated user can still read, so callers can say *why* access ended.
// No UI or Next.js code here: used by middleware, server actions and guards.

export type AccountStatus = {
  role: 'super_admin' | 'champion' | 'gatekeeper'
  is_active: boolean
  deactivation_reason: 'manual' | 'club_deactivated' | null
  must_change_password: boolean
}

/**
 * - `{ ok: true, status }`: the caller's status (status is null when the
 *   signed-in user has no profile at all — treat as not allowed in).
 * - `{ ok: false }`: couldn't be checked (network/database error). The
 *   database rules still refuse a deactivated user, so callers may let the
 *   request continue rather than sign people out on a blip.
 */
export async function fetchAccountStatus(
  supabase: Pick<SupabaseClient, 'rpc'>
): Promise<{ ok: true; status: AccountStatus | null } | { ok: false }> {
  const { data, error } = await supabase.rpc('my_account_status')
  if (error) return { ok: false }
  const row = (Array.isArray(data) ? data[0] : data) as AccountStatus | undefined
  return { ok: true, status: row ?? null }
}

export function isAllowedIn(status: AccountStatus | null): boolean {
  return !!status && status.is_active === true
}

/** The ?error= code the login pages already understand. */
export function inactiveLoginError(status: AccountStatus | null): 'club_inactive' | 'account_inactive' {
  return status?.deactivation_reason === 'club_deactivated' ? 'club_inactive' : 'account_inactive'
}
