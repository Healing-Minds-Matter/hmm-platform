import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Security Finding 6: resource deletes take only an id, are checked on the
// server, soft-delete the row, and never remove a file path the browser sent.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SA = id(1), SA_OFF = id(2), CH = id(3), GK = id(4)
const RES = id(100), OTHER_RES = id(101), CAT = id(200)
const RES_FILE = '11111111-1111-4111-8111-111111111111.pdf'
const OTHER_FILE = '22222222-2222-4222-8222-222222222222.pdf'
const NEW_UPLOAD = '33333333-3333-4333-8333-333333333333.pdf'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, me: null as string | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(h.db, 'user', h.me) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))

import { createResourceAction, deleteResourceAction, updateResourceAction } from '@/actions/resources'

const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d }
const fileRemovals = () => h.db.writes.filter(w => w.table === 'storage:resources').flatMap(w => w.values.paths as string[])
const resourceWrites = () => h.db.writes.filter(w => w.table === 'resources')
const res = (rid: string) => h.db.tables.resources.find(r => r.id === rid)!

beforeEach(() => {
  h.me = null
  const p = (pid: string, role: string, is_active = true) => ({ id: pid, role, club_id: null, is_active })
  h.db = createFakeDb({
    profiles: [p(SA, 'super_admin'), p(SA_OFF, 'super_admin', false), p(CH, 'champion'), p(GK, 'gatekeeper')],
    resource_categories: [{ id: CAT, name: 'General', is_active: true }],
    resources: [
      { id: RES, title: 'One', type: 'document', content_url: RES_FILE, category_id: CAT, status: 'published', publication_date: '2026-01-01', deleted_at: null },
      { id: OTHER_RES, title: 'Two', type: 'document', content_url: OTHER_FILE, category_id: CAT, status: 'published', publication_date: '2026-01-01', deleted_at: null },
    ],
  }, {
    // Stand-in for the database function (its own rules are tested in supabase/tests).
    soft_delete_resource: ({ p_id }, { db, userId }) => {
      const r = db.tables.resources.find(x => x.id === p_id && !x.deleted_at)
      if (!r) return { data: false, error: null }
      r.deleted_at = new Date().toISOString(); r.deleted_by = userId
      return { data: true, error: null }
    },
  })
})

describe('deleteResourceAction', () => {
  it('not signed in → login, nothing changes', async () => {
    await expect(deleteResourceAction(form({ resource_id: RES }))).rejects.toThrow('NEXT_REDIRECT')
    expect(resourceWrites()).toEqual([]); expect(fileRemovals()).toEqual([])
  })
  it.each([['Gatekeeper', GK], ['Champion', CH], ['deactivated Super Admin', SA_OFF]])('%s → refused, nothing changes', async (_l, who) => {
    h.me = who
    expect(await deleteResourceAction(form({ resource_id: RES, content_url: OTHER_FILE }))).toMatchObject({ error: expect.any(String) })
    expect(resourceWrites()).toEqual([]); expect(fileRemovals()).toEqual([])
  })
  it('Super Admin → soft delete only; a forged file path is ignored and no file is removed', async () => {
    h.me = SA
    expect(await deleteResourceAction(form({ resource_id: RES, content_url: OTHER_FILE }))).toBeUndefined()
    expect(res(RES).deleted_at).toBeTruthy()
    expect(h.db.writes.filter(w => w.table === 'rpc:soft_delete_resource')).toHaveLength(1)
    expect(h.db.writes.some(w => w.table === 'resources' && w.op === 'delete')).toBe(false)
    expect(fileRemovals()).toEqual([])
    expect(res(OTHER_RES).deleted_at).toBeNull()
  })
  it('Super Admin, made-up or malformed id → error, nothing changes', async () => {
    h.me = SA
    expect(await deleteResourceAction(form({ resource_id: id(999) }))).toMatchObject({ error: 'Resource not found.' })
    expect(await deleteResourceAction(form({ resource_id: "x' OR 1=1" }))).toMatchObject({ error: 'Resource not found.' })
    expect(resourceWrites()).toEqual([])
  })
})

describe('updateResourceAction', () => {
  const edit = (over: Record<string, string> = {}) => form({
    resource_id: RES, title: 'One', type: 'document', category_id: CAT, publication_date: '2026-01-01', intent: 'publish', ...over,
  })
  it('Gatekeeper → refused before any file handling (no upload discarded, nothing removed)', async () => {
    h.me = GK
    expect((await updateResourceAction(null, edit({ uploaded_path: NEW_UPLOAD, previous_content_url: OTHER_FILE })))?.error).toBeTruthy()
    expect(fileRemovals()).toEqual([]); expect(resourceWrites()).toEqual([])
  })
  it('Super Admin replacing the file → the OLD file comes from the database; a forged previous path is never removed', async () => {
    h.me = SA
    expect(await updateResourceAction(null, edit({ uploaded_path: NEW_UPLOAD, previous_content_url: OTHER_FILE }))).toMatchObject({ success: true })
    expect(fileRemovals()).toEqual([RES_FILE])
    expect(res(RES).content_url).toBe(NEW_UPLOAD)
  })
})

describe('createResourceAction', () => {
  it('Champion → refused before any file handling (can’t discard someone else’s upload)', async () => {
    h.me = CH
    const r = await createResourceAction(null, form({ title: '', type: 'document', uploaded_path: NEW_UPLOAD }))
    expect(r?.error).toMatch(/only super admins/i)
    expect(fileRemovals()).toEqual([])
  })
})
