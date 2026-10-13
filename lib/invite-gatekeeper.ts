import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTempPassword } from '@/lib/generate-temp-password'
import { sendGatekeeperWelcomeEmail } from '@/lib/send-email'
import { seedPasswordHistoryAdmin } from '@/lib/password-history.server'
import { describeInviteError } from '@/lib/invite-errors'

// Rewritten per the actual documented onboarding spec — this supersedes
// an earlier version of this file that used admin.auth.admin.generateLink
// (a real Supabase invite-link flow) based on an incorrect assumption
// about what was wanted. The real spec: Champion enters the Gatekeeper's
// details, the system generates a real temporary password (crypto-random,
// see generate-temp-password.ts — same generator already used for
// Champion creation, not a new one), and — per "no forced password
// change gate for Phase 1" — the Gatekeeper logs in directly with that
// email+password on first use; the welcome email just nudges them to
// change it via the already-built Change Password screen, it doesn't
// enforce it.
//
// Deliberately still its own function, not folded into
// lib/create-invited-user.ts (unchanged, still used by Champion
// creation): the branded template/placeholder set is Gatekeeper-specific
// (club_name, champion_name), and this adds a real skip-the-email option
// (sendWelcomeEmail) that Champion creation doesn't have.
export async function createGatekeeperWithTempPassword(params: {
  email: string
  fullName: string
  championName: string
  clubName: string
  appLoginLink: string
  sendWelcomeEmail: boolean
}): Promise<{ userId: string; tempPassword: string | null } | { error: string }> {
  const admin = createAdminClient()
  const tempPassword = generateTempPassword()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: params.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  })

  if (createError) {
    const lower = createError.message?.toLowerCase() ?? ''
    if (lower.includes('already registered') || lower.includes('already exists')) {
      return { error: 'An account with this email already exists.' }
    }
    return { error: describeInviteError(createError) }
  }

  const userId = created.user.id
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName

  if (params.sendWelcomeEmail) {
    const { error: emailError } = await sendGatekeeperWelcomeEmail({
      to: params.email,
      gatekeeperFirstName: firstName,
      championName: params.championName,
      clubName: params.clubName,
      tempPassword,
      appLoginLink: params.appLoginLink,
    })

    if (emailError) {
      await admin.auth.admin.deleteUser(userId)
      return { error: `Failed to send the welcome email — the account was not created. (${emailError})` }
    }
  }

  await seedPasswordHistoryAdmin(userId, tempPassword)

  // Real bug caught during the live E2E test: this used to return
  // tempPassword unconditionally, meaning the create form's "shown once
  // on screen" credentials view rendered even when the email had already
  // been sent — doubly exposing the password (emailed AND displayed) and
  // relying on the client to gate something the server should own. Now
  // only returned when the email genuinely wasn't sent, so there's
  // nothing to leak (or accidentally render) on the sent path at all.
  return { userId, tempPassword: params.sendWelcomeEmail ? null : tempPassword }
}

// Resend — there's no "the same password" to resend (never stored in
// plaintext anywhere), so this issues a genuinely NEW temporary password
// via updateUserById and re-sends the welcome email with it, invalidating
// whatever the Gatekeeper had before. Correct behavior for "the original
// email got lost/never arrived," not just a cosmetic resend.
export async function resendGatekeeperWelcomeEmail(params: {
  userId: string
  email: string
  fullName: string
  championName: string
  clubName: string
  appLoginLink: string
}): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const tempPassword = generateTempPassword()

  const { error: updateError } = await admin.auth.admin.updateUserById(params.userId, { password: tempPassword })
  if (updateError) return { error: describeInviteError(updateError) }

  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName

  const { error: emailError } = await sendGatekeeperWelcomeEmail({
    to: params.email,
    gatekeeperFirstName: firstName,
    championName: params.championName,
    clubName: params.clubName,
    tempPassword,
    appLoginLink: params.appLoginLink,
  })
  if (emailError) return { error: emailError }

  await seedPasswordHistoryAdmin(params.userId, tempPassword)
  return {}
}
