// The two web portals (Super Admin and Champion). Safe to import from both
// client and server code — no secrets here.
export type Portal = 'super_admin' | 'champion'

export function parsePortal(value: unknown): Portal {
  return value === 'champion' ? 'champion' : 'super_admin'
}

export const LOGIN_PATH: Record<Portal, string> = {
  super_admin: '/login',
  champion: '/champion/login',
}

export const FORGOT_PASSWORD_PATH: Record<Portal, string> = {
  super_admin: '/forgot-password',
  champion: '/champion/forgot-password',
}

// Which portal an account role signs in through. Gatekeepers are
// mobile-only, so they have no web portal at all.
export function portalForRole(role: string | null | undefined): Portal | null {
  if (role === 'super_admin') return 'super_admin'
  if (role === 'champion') return 'champion'
  return null
}

// Remembers which portal this browser last signed in through, so a redirect to
// login after sign-out or an expired session lands on that portal's login
// page (sheet row 58). Not a secret and not used for access decisions.
export const PORTAL_HINT_COOKIE = 'hmm_portal'

/**
 * The login page to send someone to. A /champion path, or a browser that last
 * signed in as a Champion, goes to the Champion login; everything else to the
 * Super Admin login.
 */
export function loginPathFor(opts: { pathname?: string | null; role?: string | null; hint?: string | null }): string {
  const fromRole = portalForRole(opts.role)
  if (fromRole) return LOGIN_PATH[fromRole]
  if (opts.pathname && (opts.pathname === '/champion' || opts.pathname.startsWith('/champion/'))) return LOGIN_PATH.champion
  if (opts.pathname && (opts.pathname === '/super-admin' || opts.pathname.startsWith('/super-admin/'))) return LOGIN_PATH.super_admin
  return opts.hint === 'champion' ? LOGIN_PATH.champion : LOGIN_PATH.super_admin
}
