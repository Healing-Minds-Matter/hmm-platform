import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { FORGOT_PASSWORD_PATH, LOGIN_PATH, parsePortal } from '@/lib/portals'
import { safeNextPath } from '@/lib/auth/safe-next'
import {
  RESET_GRANT_COOKIE,
  RESET_GRANT_MAX_AGE_SECONDS,
  RESET_PORTAL_COOKIE,
  createResetGrant,
} from '@/lib/password-reset-grant.server'

// Handles Supabase email link callbacks (password reset, magic link, etc.)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  // Exact allowlist only (Security Finding 9): never redirect off-site.
  const next = safeNextPath(searchParams.get('next'), LOGIN_PATH[parsePortal((await cookies()).get(RESET_PORTAL_COOKIE)?.value)])

  const cookieStore = await cookies()
  // Set by forgotPasswordAction — which portal's Forgot Password page sent
  // the link, so an expired link sends a Champion back to the Champion page.
  const portal = parsePortal(cookieStore.get(RESET_PORTAL_COOKIE)?.value)

  if (!code) {
    // An expired or already-used link comes back from Supabase with
    // ?error=access_denied&error_code=otp_expired and no code — show the
    // "link expired" message rather than a bare /login with no explanation.
    if (searchParams.get('error') || searchParams.get('error_code')) {
      return NextResponse.redirect(
        new URL(`${FORGOT_PASSWORD_PATH[portal]}?error=link_expired`, request.url)
      )
    }
    return NextResponse.redirect(new URL(`${LOGIN_PATH[portal]}?error=invalid_link`, request.url))
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Scenario 03: expired link / Scenario 04: already-used link
    return NextResponse.redirect(
      new URL(`${FORGOT_PASSWORD_PATH[portal]}?error=link_expired`, request.url)
    )
  }

  if (next === '/reset-password') {
    const sessionId = sessionIdFromAccessToken(data.session.access_token)
    if (!sessionId) {
      return NextResponse.redirect(
        new URL(`${FORGOT_PASSWORD_PATH[portal]}?error=link_expired`, request.url)
      )
    }
    cookieStore.set(RESET_GRANT_COOKIE, createResetGrant(sessionId), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RESET_GRANT_MAX_AGE_SECONDS,
    })
  }

  return NextResponse.redirect(new URL(next, request.url))
}

// The token was just issued to us by Supabase in this same request, so
// decoding (rather than re-verifying) its payload is safe here.
function sessionIdFromAccessToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}
