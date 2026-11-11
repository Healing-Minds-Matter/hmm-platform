// Client-safe — no server-only imports.

// Review Finding 2: shown on a Champion's Edit Gatekeeper form (and returned
// by the server) once the Gatekeeper has signed in.
export const CHAMPION_EMAIL_LOCKED =
  'Only a Super Admin can change this email, because this Gatekeeper has already signed in.'

// Review Finding 3: Gatekeepers registered with "send later" (no welcome email yet).
export const SEND_LATER_DONE =
  'Gatekeeper registered. No email has been sent yet. When they’re ready, open their page and press “Send Welcome Email” — it emails them a link to set their own password.'
export const BULK_SEND_LATER_NOTE =
  'No email sent yet. Send it from their page when they’re ready.'
