import 'server-only'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { describeInviteError } from '@/lib/invite-errors'

// Review Finding 3: new Champion and Gatekeeper accounts no longer get a
// temporary password. The sign-in account is created with a random password
// that is never stored, shown or emailed (so nobody can sign in with it), and
// the person chooses their own through a single-use set-password link
// (lib/account-setup.server.ts → issueAccountSetupInvite).
//
// Callers: create the profile row next, then send the link; if anything
// fails, delete the account (admin.auth.admin.deleteUser) so no half-made
// account is left behind.
export async function createAuthAccount(params: {
  email: string
  fullName: string
}): Promise<{ userId: string } | { error: string }> {
  const { data: created, error } = await createAdminClient().auth.admin.createUser({
    email: params.email,
    password: crypto.randomBytes(48).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  })
  if (error) {
    const lower = error.message?.toLowerCase() ?? ''
    if (lower.includes('already registered') || lower.includes('already exists')) {
      return { error: 'An account with this email already exists.' }
    }
    return { error: describeInviteError(error) }
  }
  return { userId: created.user.id }
}
