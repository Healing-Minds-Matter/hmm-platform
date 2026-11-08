// Server-only (uses next/headers). No "server-only" import, so server actions that use it stay testable.
// redirect() to the right portal's login page from server code (sheet row 58):
// the current user's role if known, else the request path, else the portal
// this browser last signed in through.
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PORTAL_HINT_COOKIE, loginPathFor } from '@/lib/portals'

export async function loginPath(role?: string | null): Promise<string> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  let pathname: string | null = null
  const referer = headerStore.get('referer')
  if (referer) { try { pathname = new URL(referer).pathname } catch { /* ignore */ } }
  return loginPathFor({ role, pathname, hint: cookieStore.get(PORTAL_HINT_COOKIE)?.value })
}

export async function redirectToLogin(query = ''): Promise<never> {
  redirect(`${await loginPath()}${query}`)
}
