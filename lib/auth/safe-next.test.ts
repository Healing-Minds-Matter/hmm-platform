import { describe, expect, it, vi } from 'vitest'
import { safeNextPath } from '@/lib/auth/safe-next'

// Security Finding 9: the auth callback only redirects to known in-app pages.
describe('safeNextPath', () => {
  it('keeps the reset-password page', () => expect(safeNextPath('/reset-password', '/login')).toBe('/reset-password'))
  it.each(['https://evil.example', '//evil.example', '/\evil.example', 'javascript:alert(1)', '/super-admin/../../evil', '/unknown', ''])(
    'refuses %j → fallback', next => expect(safeNextPath(next, '/login')).toBe('/login'))
  it('missing → fallback', () => expect(safeNextPath(null, '/champion/login')).toBe('/champion/login'))
})

// The real route handler, with Supabase faked.
const h = vi.hoisted(() => { process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-only-secret'; return { exchangeOk: true } })
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: async () => h.exchangeOk
        ? { data: { session: { access_token: `x.${Buffer.from(JSON.stringify({ session_id: 's1' })).toString('base64url')}.y` } }, error: null }
        : { data: {}, error: { message: 'bad' } },
    },
  }),
}))

describe('/auth/callback', () => {
  const call = async (qs: string) => {
    const { GET } = await import('@/app/auth/callback/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest(`http://localhost:3000/auth/callback?${qs}`))
    return res.headers.get('location')
  }
  it('valid code, next=/reset-password → reset page', async () => {
    expect(await call('code=abc&next=/reset-password')).toBe('http://localhost:3000/reset-password')
  })
  it.each(['https://evil.example/x', '//evil.example/x'])('valid code, next=%s → stays on this site', async next => {
    const loc = await call(`code=abc&next=${encodeURIComponent(next)}`)
    expect(new URL(loc!).host).toBe('localhost:3000')
  })
})
