'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { syncProfileEmail } from '@/lib/email-sync.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FORGOT_PASSWORD_PATH, LOGIN_PATH, parsePortal, portalForRole } from '@/lib/portals'
import {
  RESET_GRANT_COOKIE,
  RESET_GRANT_MAX_AGE_SECONDS,
  RESET_PORTAL_COOKIE,
  hasResetGrant,
} from '@/lib/password-reset-grant.server'
import { validatePassword } from '@/lib/password-validation'
import { isPasswordReused, recordPasswordHash } from '@/lib/password-history.server'
import { writeAuditLog } from '@/lib/audit'

// ---------------------------------------------------------------------------
// Login — Story 1.1
// ---------------------------------------------------------------------------
export async function loginAction(
  _prev: { error?: string } | null,
  formData: FormData
) {
  const email    = (formData.get('email')    as string).trim()
  const password = formData.get('password') as string
  const portal   = formData.get('portal') as string | null // 'super_admin' | 'champion'

  if (!email || !password) return { error: 'Email and password are required.' }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    // Scenario 02: generic error — don't reveal which field is wrong
    return { error: 'Invalid email or password.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Authentication failed. Please try again.' }

  // A confirmed self-service email change may not have reached profiles yet.
  await syncProfileEmail(user.id, user.email)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, deactivation_reason')
    .eq('id', user.id)
    .single()

  // Scenario 03: deactivated account
  if (!profile?.is_active) {
    await supabase.auth.signOut()
    if (profile?.deactivation_reason === 'club_deactivated') {
      return { error: 'Your club is currently inactive. Please contact your administrator.' }
    }
    return { error: 'Your account has been deactivated. Please contact an administrator.' }
  }

  // Two portals (this /login for Super Admin, /champion/login for Champions)
  // share this one action/form — the hidden "portal" field says which door
  // was used. A real account role mismatch (e.g. a Champion submitting the
  // Super Admin login) is blocked here with a clear redirect hint, rather
  // than silently letting them in and bouncing them to the right dashboard
  // — RLS/middleware already scope actual access by real role regardless,
  // this is purely about not letting people use the wrong door.
  if (profile.role === 'super_admin') {
    if (portal === 'champion') {
      await supabase.auth.signOut()
      return { error: 'This is a Super Admin account. Please sign in from the Super Admin login page.' }
    }
    redirect('/super-admin')
  }
  if (profile.role === 'champion') {
    if (portal === 'super_admin') {
      await supabase.auth.signOut()
      return { error: 'This is a Champion account. Please sign in from the Champion login page.' }
    }
    redirect('/champion')
  }

  // Gatekeepers are mobile-only
  await supabase.auth.signOut()
  return { error: 'This account is not authorised to access the web application.' }
}

// ---------------------------------------------------------------------------
// Forgot Password — Story 1.2
// ---------------------------------------------------------------------------
export async function forgotPasswordAction(
  _prev: { sent?: boolean } | null,
  formData: FormData
) {
  const email = (formData.get('email') as string).trim()
  if (!email) return { sent: false, error: 'Email is required.' }

  // Each portal's Forgot Password page only serves its own accounts: the
  // Super Admin page only emails Super Admins, the Champion page only
  // Champions, and neither emails Gatekeepers (mobile-only).
  const portal = parsePortal(formData.get('portal'))

  // Remembers which portal's page requested the link, so /auth/callback can
  // send an expired link back to the right Forgot Password page. Set on every
  // request (not only when a link is sent) so the response never differs.
  ;(await cookies()).set(RESET_PORTAL_COOKIE, portal, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RESET_GRANT_MAX_AGE_SECONDS,
  })

  // Scenario 02: the response is identical whether the email is unregistered,
  // belongs to a different portal's role, or really gets a link — so this
  // page never reveals whether (or as what) an account exists.
  const admin = createAdminClient()
  const { data: matches } = await admin
    .from('profiles')
    .select('role')
    .ilike('email', escapeLikePattern(email))
    .limit(2)

  const role = matches?.length === 1 ? matches[0].role : null
  if (portalForRole(role) !== portal) return { sent: true }

  const supabase = await createClient()
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // redirectTo must stay exactly as registered in Supabase's Redirect URLs
  // allow-list — adding a query param here (e.g. &portal=…) made Supabase
  // reject it and fall back to the Site URL, which lands on /login. That's
  // why the portal travels in a cookie instead (above).
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })
  // Still shown as "sent" to the user (see above), but logged so real
  // delivery failures (SMTP errors, rate limits) aren't invisible.
  if (error) console.error('[forgotPasswordAction] resetPasswordForEmail failed:', error.message)

  return { sent: true }
}

// ilike treats % and _ as wildcards — escape them so this is an exact,
// case-insensitive email match.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// ---------------------------------------------------------------------------
// Reset Password (from email link) — Story 1.2
// ---------------------------------------------------------------------------
export async function resetPasswordAction(
  _prev: { error?: string } | null,
  formData: FormData
) {
  const password = formData.get('password') as string
  const confirm  = formData.get('confirm')  as string

  // Scenario 06: passwords must match
  if (password !== confirm) return { error: 'Passwords do not match.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please request a new reset link.' }

  // Only a session that came from a reset-email link may set a password
  // without the current one — see lib/password-reset-grant.server.ts.
  if (!(await hasResetGrant())) {
    return { error: 'This reset link has expired or is no longer valid. Please request a new one.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single()

  // Scenario 05: complexity rules
  const { valid, errors } = validatePassword(password, {
    name:  profile?.full_name,
    email: profile?.email ?? user.email,
  })
  if (!valid) return { error: errors.join('\n') }

  // Scenario 07: password reuse prevention (last 5)
  if (await isPasswordReused(user.id, password)) {
    return { error: 'You cannot reuse one of your last 5 passwords. Please choose a different one.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return { error: 'Failed to reset password. The link may have expired — please request a new one.' }
  }

  // Scenario 08: record new hash, log the event; Supabase invalidates the reset link automatically
  await recordPasswordHash(user.id, password)
  await writeAuditLog({
    actorId: user.id,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
  })

  // "Forgot Password" is a legitimate escape hatch for a Champion/Gatekeeper
  // who lost their temp-password email — it must clear the same flag
  // changePasswordAction does, or they'd still get forced to /set-password
  // after a real reset (and then fail there, since their "temporary" and
  // "new" password would be identical).
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id)

  // Sign out the recovery session so the redirect below actually reaches the
  // login page instead of being bounced straight to the dashboard by
  // middleware's "authenticated user hitting /login" rule.
  await supabase.auth.signOut()
  ;(await cookies()).delete(RESET_GRANT_COOKIE)

  // Back to the account's own portal — a Champion sent to the Super Admin
  // login would just be refused there by loginAction's portal check.
  const portal = portalForRole(profile?.role) ?? 'super_admin'
  redirect(`${LOGIN_PATH[portal]}?reset=success`)
}

// ---------------------------------------------------------------------------
// Change Password (authenticated) — Story 1.3
// ---------------------------------------------------------------------------
export async function changePasswordAction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword     = formData.get('newPassword')     as string
  const confirm         = formData.get('confirm')         as string

  // Scenario 03: passwords must match
  if (newPassword !== confirm) return { error: 'New passwords do not match.' }

  // Scenario 04: new password must differ from current
  if (newPassword === currentPassword) {
    return { error: 'New password must be different from your current password.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please log in again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  // Scenario 02: complexity rules
  const { valid, errors } = validatePassword(newPassword, {
    name:  profile?.full_name,
    email: profile?.email ?? user.email,
  })
  if (!valid) return { error: errors.join('\n') }

  // Scenario 01: verify current password — generic error per story
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email:    user.email!,
    password: currentPassword,
  })
  if (verifyError) {
    // TEMP DIAGNOSTIC LOGGING — remove once the "Password change failed"
    // root cause is confirmed. The user-facing message is intentionally
    // generic (Scenario 01), but that means real auth failures (expired
    // session, unconfirmed email, rate limit) get masked as "wrong
    // password" with no way to tell them apart from server logs alone.
    console.error('[changePasswordAction] signInWithPassword verify failed:', {
      email: user.email,
      status: verifyError.status,
      code: (verifyError as { code?: string }).code,
      message: verifyError.message,
    })
    return { error: 'Password change failed. Please check your current password and try again.' }
  }

  // Scenario 05: reuse prevention (last 5)
  if (await isPasswordReused(user.id, newPassword)) {
    return { error: 'You cannot reuse one of your last 5 passwords. Please choose a different one.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) return { error: 'Failed to update password. Please try again.' }

  // Scenario 06: record hash + audit log
  await recordPasswordHash(user.id, newPassword)
  await writeAuditLog({
    actorId: user.id,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
  })

  // Clears the forced-first-login flag if it was set — a harmless no-op
  // for the normal elective "change my password" flow (already false),
  // but this is also the exact same action the forced /set-password screen
  // calls after a Champion/Gatekeeper's temp password verifies correctly,
  // so this one line is what actually lifts the block. Uses the regular
  // authenticated client — same as everything else in this action — since
  // must_change_password is deliberately not one of the columns the
  // self-update-privileged-fields trigger pins.
  await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id)

  // Scenario 07: keep this session active, but require re-authentication on
  // every other active session/device.
  await supabase.auth.signOut({ scope: 'others' })

  return { success: true }
}

// ---------------------------------------------------------------------------
// Change sign-in email (Super Admin only) — Profile → Security & Sign-in
// ---------------------------------------------------------------------------
// A deliberate, signed-off extension of Story 3.1 Scenario 03 (which shows the
// login email as read-only): the email is still never directly editable —
// it only changes after confirmation. Safeguards: re-enter the current
// password; the new address must be unused; Supabase's "Secure email change"
// then emails a confirmation link to BOTH the current and the new address,
// and nothing changes until both are clicked. profiles.email follows via
// syncProfileEmail() once Supabase applies the change.
export async function requestEmailChangeAction(
  _prev: { error?: string; success?: boolean; newEmail?: string } | null,
  formData: FormData
) {
  const newEmail = ((formData.get('newEmail') as string) ?? '').trim().toLowerCase()
  const password = (formData.get('currentPassword') as string) ?? ''

  if (!newEmail || !password) return { error: 'New email and current password are required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return { error: 'Please enter a valid email address.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Session expired. Please log in again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'super_admin') return { error: 'Only Super Admins can change their sign-in email here.' }

  if (newEmail === user.email.toLowerCase()) {
    return { error: 'That is already your sign-in email.' }
  }

  // Verify the current password with a throwaway client, so the user's real
  // session cookies aren't replaced by a fresh sign-in. Same generic message
  // as Change Password — don't say which part failed.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password })
  if (verifyError) return { error: 'Incorrect password. Please try again.' }
  await verifier.auth.signOut({ scope: 'local' })

  // Unused address only — profiles.email is UNIQUE, and a clash would
  // otherwise only surface after the confirmation links were already sent.
  const admin = createAdminClient()
  const { data: clash } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', escapeLikePattern(newEmail))
    .neq('id', user.id)
    .limit(1)
  if (clash && clash.length > 0) return { error: 'That email is already used by another account.' }

  // The "Change Email Address" email template builds its link from this
  // ({{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change), so it
  // opens our confirmation page rather than confirming on click — email
  // security scanners open links automatically, but don't press buttons.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { error: updateError } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${siteUrl}/auth/confirm-email-change` }
  )
  if (updateError) {
    console.error('[requestEmailChangeAction] updateUser failed:', updateError.message)
    const code = (updateError as { code?: string }).code
    if (code === 'email_exists') return { error: 'That email is already used by another account.' }
    if (code === 'over_email_send_rate_limit' || updateError.status === 429) {
      return { error: 'Too many requests. Please wait a minute and try again.' }
    }
    return { error: 'Could not start the email change. Please try again.' }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.email_change_requested',
    entityType: 'user',
    entityId: user.id,
    details: { from: user.email, to: newEmail },
  })

  return { success: true, newEmail }
}

// Runs only when a person presses "Confirm" on /auth/confirm-email-change —
// never on simply opening the emailed link. With Secure email change, each
// address gets its own link: the first confirmation leaves the change
// pending, the second applies it.
export async function confirmEmailChangeAction(
  _prev: { status?: 'partial' | 'done' | 'error'; signedIn?: boolean } | null,
  formData: FormData
): Promise<{ status: 'partial' | 'done' | 'error'; signedIn?: boolean }> {
  const tokenHash = (formData.get('token_hash') as string) ?? ''
  if (!tokenHash) return { status: 'error' }

  // Verified on a throwaway client so confirming never signs this browser in
  // as that account (the link may be opened on any device, by anyone who can
  // read that inbox) — any session it returns is revoked straight away.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data, error } = await verifier.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' })
  if (error) return { status: 'error' }

  // No session back = Supabase accepted this address but is still waiting
  // for the other one.
  if (!data.session || !data.user) return { status: 'partial' }

  await verifier.auth.signOut({ scope: 'local' })
  await syncProfileEmail(data.user.id, data.user.email)

  const supabase = await createClient()
  const { data: { user: current } } = await supabase.auth.getUser()
  return { status: 'done', signedIn: current?.id === data.user.id }
}

// ---------------------------------------------------------------------------
// Logout — Story 1.4 Scenario 01
// ---------------------------------------------------------------------------
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// "Forgot current password?" / "Didn't get one?" on the Change Password and
// Set Your Password screens. The forgot-password pages only serve signed-out
// users (middleware sends signed-in users to their dashboard), and each
// portal's page only emails its own role — so sign this device out and go to
// the user's own portal's page. Gatekeepers have no web portal: login page.
export async function signOutToForgotPasswordAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let destination = '/login'
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const portal = portalForRole(profile?.role)
    if (portal) destination = FORGOT_PASSWORD_PATH[portal]
  }

  // This device only — the user's other sessions are left alone.
  await supabase.auth.signOut({ scope: 'local' })
  redirect(destination)
}

// Story 1.4 Scenario 04: timeout logout must redirect with session_expired param
export async function sessionTimeoutLogoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login?error=session_expired')
}
