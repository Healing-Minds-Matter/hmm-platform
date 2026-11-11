// Client-safe — no server-only imports.

// Review Finding 2: shown on a Champion's Edit Gatekeeper form (and returned
// by the server) once the Gatekeeper has signed in.
export const CHAMPION_EMAIL_LOCKED =
  'Only a Super Admin can change this email, because this Gatekeeper has already signed in.'
