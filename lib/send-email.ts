import 'server-only'
import fs from 'fs'
import path from 'path'

// SendGrid Web API (not Supabase's SMTP-relayed mailer) — needed here
// specifically because Supabase's own invite/magic-link email templates
// have no way to embed this app's own content (club and Champion names, our
// own single-use links). Every other transactional email in this app
// (password-changed notifications, the reset-password link itself) still
// goes through Supabase's existing SMTP config unchanged; this is a
// separate, narrow path for the account emails below. No email here ever
// contains a password.
async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ error?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return { error: 'SENDGRID_API_KEY is not configured.' }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      // Matches the SendGrid Single Sender already verified for this
      // project's Supabase SMTP config (see CLAUDE.md) — reusing the same
      // verified identity rather than a second, unverified sender.
      from: { email: 'jayani@ensiz.com', name: 'Healing Minds Matter' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { error: `SendGrid returned ${res.status}: ${body.slice(0, 500)}` }
  }

  return {}
}

// Review Finding 3: the branded Gatekeeper welcome email. Carries a
// single-use set-password link, never a password. Sent through SendGrid (not
// Supabase's mailer) because the template needs champion_name/club_name,
// which live in this app's own tables.
export async function sendGatekeeperWelcomeEmail(params: {
  to: string
  gatekeeperFirstName: string
  championName: string
  clubName: string
  setPasswordLink: string
  expiresInHours: number
}): Promise<{ error?: string }> {
  const templatePath = path.join(process.cwd(), 'emails', 'templates', 'hmm_gatekeeper_welcome_email_v2.html')
  let template: string
  try {
    template = fs.readFileSync(templatePath, 'utf-8')
  } catch {
    return { error: 'Email template not found.' }
  }

  const values: Record<string, string> = {
    gatekeeper_first_name: params.gatekeeperFirstName,
    champion_name: params.championName,
    club_name: params.clubName,
    gatekeeper_email: params.to,
    set_password_link: params.setPasswordLink,
    expires_in_hours: String(params.expiresInHours),
    android_download_link: process.env.GATEKEEPER_ANDROID_DOWNLOAD_URL ?? '#',
    ios_download_link: process.env.GATEKEEPER_IOS_DOWNLOAD_URL ?? '#',
    current_year: String(new Date().getFullYear()),
  }

  // Links stay unescaped (escapeHtml would turn a "&" in a query string into
  // "&amp;"); every other field is escaped.
  const rawKeys = new Set(['set_password_link', 'android_download_link', 'ios_download_link'])
  const html = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) return `{{${key}}}`
    return rawKeys.has(key) ? values[key] : escapeHtml(values[key])
  })

  const text = `Hi ${params.gatekeeperFirstName},

${params.championName} has created your Gatekeeper account for ${params.clubName} on Healing Minds Matter.

Set your password here: ${params.setPasswordLink}
The link works once and expires in ${params.expiresInHours} hours.

Then download the HMM Gatekeeper app and sign in with ${params.to} and your new password.`

  return sendEmail({
    to: params.to,
    subject: `Your Healing Minds Matter Gatekeeper account is ready`,
    html,
    text,
  })
}

// Security Finding 3: an email change started by a Super Admin or Champion
// for someone else only applies once the new address confirms this link.
export async function sendEmailChangeConfirmation(params: {
  to: string
  fullName: string
  confirmUrl: string
  expiresInHours: number
}): Promise<{ error?: string }> {
  const name = escapeHtml(params.fullName)
  const html = `<p>Hi ${name},</p>
<p>Your Healing Minds Matter administrator asked to change the sign-in email of your account to this address.</p>
<p><a href="${escapeHtml(params.confirmUrl)}">Confirm this email address</a></p>
<p>The link works once and expires in ${params.expiresInHours} hours. If you weren't expecting this, ignore this email — nothing will change.</p>`
  const text = `Hi ${params.fullName},

Your Healing Minds Matter administrator asked to change the sign-in email of your account to this address.

Confirm it here: ${params.confirmUrl}

The link works once and expires in ${params.expiresInHours} hours. If you weren't expecting this, ignore this email — nothing will change.`
  return sendEmail({ to: params.to, subject: 'Confirm your new Healing Minds Matter sign-in email', html, text })
}

/** Tells the current address that a change was requested, so it can't happen unnoticed. */
export async function sendEmailChangeNotice(params: { to: string; fullName: string; newEmail: string }): Promise<{ error?: string }> {
  const html = `<p>Hi ${escapeHtml(params.fullName)},</p>
<p>A request was made to change the sign-in email of your Healing Minds Matter account to <strong>${escapeHtml(params.newEmail)}</strong>. It will only change once that address confirms.</p>
<p>If you didn't expect this, contact your Club Champion or administrator. Until then you can keep signing in with this address.</p>`
  const text = `Hi ${params.fullName},

A request was made to change the sign-in email of your Healing Minds Matter account to ${params.newEmail}. It will only change once that address confirms.

If you didn't expect this, contact your Club Champion or administrator. Until then you can keep signing in with this address.`
  return sendEmail({ to: params.to, subject: 'Your Healing Minds Matter sign-in email change request', html, text })
}

// Review Finding 2: a single-use link to choose the account's first password.
// No password is ever put in an email.
export async function sendAccountSetupEmail(params: {
  to: string
  fullName: string
  setupUrl: string
  expiresInHours: number
  /** Gatekeepers: where to get the app. */
  appLink?: string
}): Promise<{ error?: string }> {
  const name = escapeHtml(params.fullName)
  const appHtml = params.appLink
    ? `<p>Then sign in to the Healing Minds Matter app with this email address and your new password. <a href="${escapeHtml(params.appLink)}">Get the app</a></p>`
    : '<p>Then sign in with this email address and your new password.</p>'
  const appText = params.appLink
    ? `Then sign in to the Healing Minds Matter app with this email address and your new password. Get the app: ${params.appLink}`
    : 'Then sign in with this email address and your new password.'
  const html = `<p>Hi ${name},</p>
<p>Your Healing Minds Matter account is ready. Choose your password here:</p>
<p><a href="${escapeHtml(params.setupUrl)}">Set your password</a></p>
${appHtml}
<p>The link works once and expires in ${params.expiresInHours} hours. If it has expired, use “Forgot password?” on the sign-in screen to get a new link. If you weren't expecting this, you can ignore this email.</p>`
  const text = `Hi ${params.fullName},

Your Healing Minds Matter account is ready. Choose your password here: ${params.setupUrl}

${appText}

The link works once and expires in ${params.expiresInHours} hours. If it has expired, use “Forgot password?” on the sign-in screen to get a new link. If you weren't expecting this, you can ignore this email.`
  return sendEmail({ to: params.to, subject: 'Set your Healing Minds Matter password', html, text })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
