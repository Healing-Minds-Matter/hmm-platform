import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

// Review Finding 13c: security headers on every response, a nonce-based
// Content-Security-Policy on every page, and the middleware matcher no longer
// skips paths by accident.

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => ({}),
    },
    rpc: async () => ({ data: [], error: null }),
  }),
}))

import { config, middleware } from '@/middleware'
import nextConfig from '@/next.config'
import { buildCsp, newNonce, SECURITY_HEADERS } from '@/lib/security-headers'

const SUPABASE = 'https://abcd.supabase.co'
const policy = (csp: string) => Object.fromEntries(csp.split('; ').map(d => { const [k, ...v] = d.split(' '); return [k, v] }))

describe('Content-Security-Policy', () => {
  const csp = policy(buildCsp({ nonce: 'N0nce', supabaseUrl: SUPABASE, isDev: false }))

  it('scripts: only ours, with this request’s nonce; no inline or eval', () => {
    expect(csp['script-src']).toEqual(["'self'", "'nonce-N0nce'", "'strict-dynamic'"])
  })
  it('the portal can’t be framed; no plugins; forms and <base> stay on this site', () => {
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['form-action']).toEqual(["'self'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['upgrade-insecure-requests']).toEqual([])
  })
  it('Supabase REST, Auth, Storage and Realtime are allowed — and nothing else outside', () => {
    expect(csp['connect-src']).toEqual(["'self'", SUPABASE, 'wss://abcd.supabase.co'])
    expect(csp['img-src']).toEqual(["'self'", 'data:', 'blob:', SUPABASE])
    expect(csp['frame-src']).toEqual(["'self'", 'blob:', SUPABASE])
    expect(csp['media-src']).toEqual(["'self'", 'blob:', SUPABASE])
  })
  it('development only: eval for React’s error overlay and the hot-reload socket', () => {
    const dev = policy(buildCsp({ nonce: 'n', supabaseUrl: 'http://127.0.0.1:54321', isDev: true }))
    expect(dev['script-src']).toContain("'unsafe-eval'")
    expect(dev['connect-src']).toEqual(["'self'", 'http://127.0.0.1:54321', 'ws://127.0.0.1:54321', 'ws:'])
    expect(dev['upgrade-insecure-requests']).toBeUndefined()
  })
  it('a fresh, unguessable nonce each time', () => {
    const a = newNonce(), b = newNonce()
    expect(a).not.toBe(b)
    expect(atob(a)).toHaveLength(16)
  })
})

describe('middleware responses carry the headers', () => {
  const req = (path: string) => new NextRequest(new URL(path, 'http://localhost:3000'))

  it.each(['/login', '/super-admin', '/champion/login', '/api/anything'])('%s (page or redirect)', async (path) => {
    const res = await middleware(req(path))
    const csp = res.headers.get('content-security-policy')!
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    for (const { key, value } of SECURITY_HEADERS) expect(res.headers.get(key)).toBe(value)
  })

  it('Next.js gets the same policy on the request, so it can put the nonce on its scripts', async () => {
    const request = req('/login')
    const res = await middleware(request)
    expect(request.headers.get('content-security-policy')).toBe(res.headers.get('content-security-policy'))
  })

  it('a new nonce for every request', async () => {
    const nonce = async () => (await middleware(req('/login'))).headers.get('content-security-policy')!.match(/'nonce-([^']+)'/)![1]
    expect(await nonce()).not.toBe(await nonce())
  })

  it('the exact values asked for', () => {
    const h = Object.fromEntries(SECURITY_HEADERS.map(x => [x.key, x.value]))
    expect(h['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Permissions-Policy']).toMatch(/camera=\(\).*geolocation=\(\).*microphone=\(\)/)
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })

  it('next.config sends Cross-Origin-Opener-Policy on every path', async () => {
    const [rule] = await nextConfig.headers!()
    expect(rule.source).toBe('/:path*')
    expect(rule.headers).toContainEqual({ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' })
  })

  it('next.config sends the fixed headers on every path, static files included', async () => {
    const rules = await nextConfig.headers!()
    expect(rules).toEqual([{ source: '/:path*', headers: SECURITY_HEADERS }])
  })
})

describe('middleware matcher', () => {
  const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url })

  it.each([
    '/super-admin/champions/xpng', // skipped before the fix
    '/super-admin/clubs/abcsvg',
    '/champion/gatekeepers/jpeg',
    '/super-admin/resources/fgif',
    '/faviconXico',
    '/favicon.icon',
    '/login', '/super-admin', '/champion', '/auth/callback', '/.well-known/assetlinks.json', '/fonts/cert/a.ttf',
  ])('runs on %s', (url) => {
    expect(runs(url)).toBe(true)
  })

  it.each(['/icons/export.svg', '/images/login/photo.jpg', '/favicon.ico', '/_next/static/chunks/main.js', '/_next/image?url=x'])(
    'skips the static file %s', (url) => {
      expect(runs(url)).toBe(false)
    })
})
