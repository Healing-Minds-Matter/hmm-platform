import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { PORTAL_HINT_COOKIE, loginPathFor } from '@/lib/portals'
import { LAST_ACTIVE_COOKIE, SESSION_MAX_AGE_MS, sessionEnded, signedInAtFromAccessToken } from '@/lib/session-policy'

const PUBLIC_PREFIXES = ['/login', '/champion/login', '/forgot-password', '/champion/forgot-password', '/reset-password', '/auth/']

// Sign-in pages an already-authenticated user gets bounced away from.
const AUTH_PAGES = ['/login', '/champion/login', '/forgot-password', '/champion/forgot-password']

export async function middleware(request: NextRequest) {
  // Must be created before any other logic so cookie refresh always runs
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST be called before any redirects
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  // Sheet row 58: send people to their own portal's login page.
  const loginUrl = (query = '') =>
    new URL(`${loginPathFor({ pathname, hint: request.cookies.get(PORTAL_HINT_COOKIE)?.value })}${query}`, request.url)

  // Root → login
  if (pathname === '/') {
    return NextResponse.redirect(loginUrl())
  }

  // Protected route, not authenticated → login
  if (!user && !isPublic) {
    return NextResponse.redirect(loginUrl())
  }

  // Sheet row 5: the server-side half of the session limits (the browser
  // shows the warning; this catches closed, frozen or tampered tabs).
  // Idle = no request for 30 minutes; maximum = 12 hours after sign-in.
  if (user) {
    const now = Date.now()
    const { data: { session } } = await supabase.auth.getSession()
    const signedInAt = signedInAtFromAccessToken(session?.access_token)
    const raw = Number(request.cookies.get(LAST_ACTIVE_COOKIE)?.value)
    // A clock older than this sign-in belongs to an earlier session (e.g. a
    // password-reset link opened in a browser that was closed while signed in).
    const lastActive = Number.isFinite(raw) && raw > 0 && (signedInAt === null || raw >= signedInAt) ? raw : null
    if (sessionEnded(now, lastActive, signedInAt)) {
      await supabase.auth.signOut({ scope: 'local' })
      // A server action (including the browser's own idle sign-out, which
      // fires at the same moment) can't follow a redirect — it would show an
      // error screen. Let it through signed out: the action finds no user and
      // redirects to the login page itself.
      if (request.method === 'POST' && request.headers.has('next-action')) {
        supabaseResponse.cookies.delete(LAST_ACTIVE_COOKIE)
        return supabaseResponse
      }
      const res = NextResponse.redirect(loginUrl('?error=session_expired'))
      // Carry over the cleared Supabase auth cookies.
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c))
      res.cookies.delete(LAST_ACTIVE_COOKIE)
      return res
    }
    // Background prefetches aren't the user doing anything.
    const isPrefetch = request.headers.get('next-router-prefetch') === '1' || request.headers.get('purpose') === 'prefetch'
    if (!isPrefetch || lastActive === null) {
      supabaseResponse.cookies.set(LAST_ACTIVE_COOKIE, String(now), {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MAX_AGE_MS / 1000,
      })
    }
  }

  const needsRole =
    user &&
    (AUTH_PAGES.includes(pathname) ||
     pathname.startsWith('/super-admin') || pathname.startsWith('/champion') ||
     pathname === '/set-password')

  if (needsRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, must_change_password')
      .eq('id', user.id)
      .single()

    const destination = profile?.role === 'champion' ? '/champion' : '/super-admin'
    const mustSetPassword = profile?.must_change_password === true

    // Authenticated user hitting auth pages → send to their dashboard, or
    // to the forced password screen first if they haven't set a real
    // password yet. This applies regardless of which login route (admin or
    // Champion) they landed on — an already-signed-in user just gets bounced
    // to their own dashboard, not blocked; the portal mismatch check that
    // actually blocks a login attempt lives in loginAction itself, since
    // that's the only place that sees which portal was submitted vs. the
    // resulting account's real role.
    if (AUTH_PAGES.includes(pathname)) {
      return withCookies(NextResponse.redirect(new URL(mustSetPassword ? '/set-password' : destination, request.url)), supabaseResponse)
    }

    // Forced first-login password change (Champions/Gatekeepers created
    // with a temporary password) — blocks every dashboard route until
    // must_change_password is cleared. /reset-password and /auth/* stay
    // reachable throughout (PUBLIC_PREFIXES, checked earlier above) since
    // "Forgot Password" is a legitimate way to satisfy this same
    // requirement without knowing the temporary password.
    if (mustSetPassword && pathname !== '/set-password') {
      return withCookies(NextResponse.redirect(new URL('/set-password', request.url)), supabaseResponse)
    }
    if (!mustSetPassword && pathname === '/set-password') {
      return withCookies(NextResponse.redirect(new URL(destination, request.url)), supabaseResponse)
    }

    // Role-gate the dashboard route groups themselves — RLS already scopes
    // the underlying data per role, but pages under the wrong role's route
    // group have no other guard, so a Champion could otherwise browse
    // straight into Super Admin screens (and vice versa) by URL.
    if (pathname.startsWith('/super-admin') && profile?.role !== 'super_admin') {
      return withCookies(NextResponse.redirect(new URL(destination, request.url)), supabaseResponse)
    }
    if (pathname.startsWith('/champion') && profile?.role !== 'champion') {
      return withCookies(NextResponse.redirect(new URL(destination, request.url)), supabaseResponse)
    }
  }

  return supabaseResponse
}

// Keep refreshed auth cookies and the idle clock on a redirect response.
function withCookies(res: NextResponse, from: NextResponse) {
  from.cookies.getAll().forEach(c => res.cookies.set(c))
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
