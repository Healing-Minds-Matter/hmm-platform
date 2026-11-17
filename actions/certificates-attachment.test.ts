import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review Finding 13h: the browser names a certificate, never a file. The
// attachment path comes from the certificate row the user can see.

const s = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, { attachment_path: string | null }>>,
  signed: [] as string[],
  tables: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      s.tables.push(table)
      return { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: s.rows[table]?.[id] ?? null }) }) }) }
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => { s.signed.push(path); return { data: { signedUrl: `https://signed/${path}` } } } }) },
  }),
}))

import { attachmentLinkAction } from '@/actions/certificates'

const CERT = '11111111-1111-4111-8111-111111111111'
const SELF = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  s.signed = []; s.tables = []
  s.rows = {
    certificates: { [CERT]: { attachment_path: `certificates/aaaa/file.pdf` } },
    self_reported_certificates: { [SELF]: { attachment_path: `self/bbbb/photo.jpg` } },
  }
})

describe('attachmentLinkAction', () => {
  it('official certificate → signs the path stored on that certificate', async () => {
    expect(await attachmentLinkAction('official', CERT)).toBe('https://signed/certificates/aaaa/file.pdf')
    expect(s.tables).toEqual(['certificates'])
  })
  it('self-reported certificate → reads the self-reported table', async () => {
    expect(await attachmentLinkAction('self', SELF)).toBe('https://signed/self/bbbb/photo.jpg')
    expect(s.tables).toEqual(['self_reported_certificates'])
  })
  it('a certificate the user can’t see (or with no attachment) → no link', async () => {
    expect(await attachmentLinkAction('official', '33333333-3333-4333-8333-333333333333')).toBeNull()
    s.rows.certificates[CERT].attachment_path = null
    expect(await attachmentLinkAction('official', CERT)).toBeNull()
    expect(s.signed).toEqual([])
  })
  it('a file path sent instead of a certificate id is refused, never signed', async () => {
    expect(await attachmentLinkAction('official', 'certificates/victim/secret.pdf')).toBeNull()
    expect(await attachmentLinkAction('nonsense' as never, CERT)).toBeNull()
    expect(s.signed).toEqual([])
  })
})
