// Review Finding 13c: security headers for every page of the web portals.
// Imported by middleware.ts (the per-request Content-Security-Policy with a
// fresh nonce) and next.config.ts (the fixed headers, for every response
// including static files). No path aliases here: next.config.ts imports it.
//
// What the portals load, and so what the policy allows:
//   scripts  — only our own, carrying this request's nonce ('strict-dynamic'
//              lets those load the rest of the Next.js bundles);
//   styles   — our own, plus inline style attributes (used throughout the
//              UI; a nonce can't cover style attributes);
//   images   — our own, data: (the two-step verification QR code), blob:
//              (certificate designer previews) and Supabase Storage;
//   requests — our own and Supabase (REST, Auth, Storage uploads, Realtime);
//   frames   — our own, blob: (printing a PDF) and Supabase Storage (the
//              certificate preview). The web portals embed no third-party
//              videos (resources link out), so no video sites are allowed;
//   fonts    — our own (next/font serves Google fonts from this site).
// Nothing may frame the portal (clickjacking): frame-ancestors 'none'.

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function buildCsp({ nonce, supabaseUrl, isDev }: { nonce: string; supabaseUrl?: string; isDev: boolean }): string {
  let supabase = ''
  let realtime = ''
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl)
      supabase = u.origin
      realtime = `${u.protocol === 'http:' ? 'ws:' : 'wss:'}//${u.host}`
    }
  } catch {
    // A malformed URL just means Supabase isn't allowed (fails closed).
  }
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', supabase]],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", supabase, realtime, ...(isDev ? ['ws:'] : [])]],
    ['media-src', ["'self'", 'blob:', supabase]],
    ['frame-src', ["'self'", 'blob:', supabase]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  const policy = directives.map(([name, values]) => [name, ...values.filter(Boolean)].join(' '))
  if (!isDev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=()',
  'usb=()',
].join(', ')

/** Sent with every response (pages, files, redirects). */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  // Older browsers that don't know frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Fix U: a page from another site that opens the portal (or that the portal
  // opens) can't reach this window through window.opener. Safe here: every new
  // tab the portal opens already uses noopener, and sign-in uses redirects,
  // not popups.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]
