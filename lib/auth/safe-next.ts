// Security Finding 9: /auth/callback used to redirect to whatever `next` the
// URL carried (`new URL(next, request.url)` follows absolute and
// protocol-relative URLs to other sites). Only these in-app destinations
// are allowed; anything else falls back to the caller's default.
const ALLOWED_NEXT = new Set(['/reset-password', '/login', '/champion/login', '/super-admin', '/champion'])

export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !ALLOWED_NEXT.has(next)) return fallback
  return next
}
