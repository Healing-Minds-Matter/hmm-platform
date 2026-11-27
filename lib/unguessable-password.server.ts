import 'server-only'
import crypto from 'crypto'

// A random password that is never stored, shown or emailed, so nobody can
// sign in with it. Used for new accounts (lib/create-invited-user.ts) and to
// retire a temporary password when a set-password link is sent
// (lib/account-setup.server.ts).
//
// Review Finding 8: Supabase requires upper, lower, digit and symbol. A
// random base64url string has no symbol about 1 time in 8, so the fixed
// "aA1!" tail guarantees all four. Still 64 random characters nobody is told.
export function unguessablePassword(): string {
  return `${crypto.randomBytes(48).toString('base64url')}aA1!`
}
