import 'server-only'
import { createHash } from 'node:crypto'

// Fix 3: free leaked-password check (Supabase's own one needs a paid plan).
// Uses Have I Been Pwned's k-anonymity range API: only the first 5
// characters of the password's SHA-1 hash leave this server; the full hash
// and the password never do. Padding hides the real size of the answer.
// If the service is slow or unreachable the password is allowed, so an
// outage never stops anyone setting a password.

export const PWNED_PASSWORD_MESSAGE =
  'This password has appeared in a known data breach. Please choose a different one.'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 3000

export async function isPwnedPassword(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  try {
    const res = await fetchImpl(`${RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'hmm-password-check' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[pwned-password] check skipped', { status: res.status })
      return false
    }
    for (const line of (await res.text()).split('\n')) {
      const [hashSuffix, count] = line.trim().split(':')
      // Padding lines have a count of 0.
      if (hashSuffix === suffix && Number(count) > 0) return true
    }
    return false
  } catch {
    console.warn('[pwned-password] check skipped (service unreachable)')
    return false
  }
}
