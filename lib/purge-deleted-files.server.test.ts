import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Decision 2 (after Security Finding 6): files of resources deleted more than
// N days ago are removed by trusted server code; the rows are kept.
const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))

import { purgeAfterDays, purgeDeletedResourceFiles } from '@/lib/purge-deleted-files.server'
import { GET } from '@/app/api/cron/purge-deleted-files/route'
import { writeAuditLog } from '@/lib/audit'

const NOW = new Date('2026-12-31T00:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString()
const removed = () => h.db.writes.filter(w => w.table === 'storage:resources').flatMap(w => w.values.paths as string[])

beforeEach(() => {
  vi.mocked(writeAuditLog).mockClear()
  h.db = createFakeDb({
    resources: [
      { id: 'old-file', content_url: 'a.pdf', deleted_at: daysAgo(45), file_purged_at: null },
      { id: 'old-link', content_url: 'https://example.org/x', deleted_at: daysAgo(45), file_purged_at: null },
      { id: 'recent', content_url: 'b.pdf', deleted_at: daysAgo(5), file_purged_at: null },
      { id: 'live', content_url: 'c.pdf', deleted_at: null, file_purged_at: null },
      { id: 'done', content_url: 'd.pdf', deleted_at: daysAgo(90), file_purged_at: daysAgo(60) },
    ],
  })
})

describe('purgeDeletedResourceFiles', () => {
  it('removes only files of resources deleted more than 30 days ago; keeps the rows', async () => {
    expect(await purgeDeletedResourceFiles(30, NOW)).toEqual({ purged: 2, olderThanDays: 30 })
    expect(removed()).toEqual(['a.pdf'])            // external links have no file
    const row = (id: string) => h.db.tables.resources.find(r => r.id === id)!
    expect(row('old-file').file_purged_at).toBe(NOW.toISOString())
    expect(row('recent').file_purged_at).toBeNull()
    expect(row('live').file_purged_at).toBeNull()
    expect(h.db.tables.resources).toHaveLength(5)  // nothing hard-deleted
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'resource.files_purged' }))
  })
  it('running again does nothing more', async () => {
    await purgeDeletedResourceFiles(30, NOW)
    expect(await purgeDeletedResourceFiles(30, NOW)).toEqual({ purged: 0, olderThanDays: 30 })
    expect(removed()).toEqual(['a.pdf'])
  })
  it('retention setting: sensible default, bad values ignored', () => {
    expect(purgeAfterDays(undefined)).toBe(30)
    expect(purgeAfterDays('7')).toBe(7)
    expect(purgeAfterDays('0')).toBe(30)
    expect(purgeAfterDays('abc')).toBe(30)
  })
})

describe('cron route', () => {
  const call = (auth?: string) => GET(new Request('http://localhost/api/cron/purge-deleted-files', { headers: auth ? { authorization: auth } : {} }))
  it('without CRON_SECRET configured → refuses, nothing removed', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer anything')).status).toBe(401)
    expect(removed()).toEqual([])
  })
  it('wrong or missing secret → refuses', async () => {
    process.env.CRON_SECRET = 's3cret'
    expect((await call()).status).toBe(401)
    expect((await call('Bearer nope')).status).toBe(401)
    expect(removed()).toEqual([])
  })
  it('right secret → runs', async () => {
    process.env.CRON_SECRET = 's3cret'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    try {
      const res = await call('Bearer s3cret')
      expect(res.status).toBe(200)
      expect(removed()).toEqual(['a.pdf'])
    } finally {
      vi.useRealTimers()
    }
  })
})
