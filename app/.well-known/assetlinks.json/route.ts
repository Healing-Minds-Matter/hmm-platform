import { androidAssetLinks } from '@/lib/app-links'

// Android App Links (Security Finding 9). 404 until APP_LINK_ANDROID_PACKAGE and
// APP_LINK_ANDROID_SHA256 are set — see lib/app-links.ts.
export function GET() {
  const body = androidAssetLinks()
  if (!body) return new Response('Not configured', { status: 404 })
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
