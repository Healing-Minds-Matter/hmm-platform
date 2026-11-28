import { mobileSignIn } from '@/lib/auth/mobile-auth.server'

// Fix 3: called by the Gatekeeper app (see lib/auth/mobile-auth.server.ts).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return mobileSignIn(request)
}
