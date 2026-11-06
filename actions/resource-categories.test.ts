import { beforeEach, describe, expect, it, vi } from 'vitest'

// Resources > Categories server actions (sheet row 26), called directly as a
// modified browser could: the permission check runs on the server, through the
// shared permission resolver (cert_can), not only by hiding the page's buttons.
const db = vi.hoisted(() => ({
  allowed: true,
  categories: [] as { id: string; name: string; is_active: boolean }[],
  inUse: 0,
  writes: [] as { op: string; row?: unknown; id?: string }[],
  rpcArgs: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async (_fn: string, args: unknown) => { db.rpcArgs.push(args); return { data: db.allowed } },
    from: (table: string) => {
      if (table === 'resources') return { select: () => ({ eq: async () => ({ count: db.inUse }) }) }
      return {
        select: async () => ({ data: db.categories }),
        insert: async (row: unknown) => { db.writes.push({ op: 'insert', row }); return { error: null } },
        update: (row: unknown) => ({
          eq: (_c: string, id: string) => {
            db.writes.push({ op: 'update', row, id })
            const r = { error: null }
            return Object.assign(Promise.resolve(r), { select: async () => ({ data: [{ id }], error: null }) })
          },
        }),
        delete: () => ({ eq: (_c: string, id: string) => ({ select: async () => { db.writes.push({ op: 'delete', id }); return { data: [{ id }], error: null } } }) }),
      }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createCategoryAction, deleteCategoryAction, renameCategoryAction, setCategoryActiveAction } from '@/actions/resource-categories'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  db.allowed = true
  db.categories = [{ id: 'a', name: 'Facilitator Kits', is_active: true }]
  db.inUse = 0
  db.writes = []
  db.rpcArgs = []
})

describe('permission', () => {
  it('refuses everyone without manage_resource_categories, before writing', async () => {
    db.allowed = false
    const refused = { error: "You don't have permission to manage resource categories." }
    expect(await createCategoryAction(null, form({ name: 'New' }))).toEqual(refused)
    expect(await renameCategoryAction(null, form({ category_id: 'a', name: 'X' }))).toEqual(refused)
    expect(await setCategoryActiveAction(null, form({ category_id: 'a', active: 'false' }))).toEqual(refused)
    expect(await deleteCategoryAction(null, form({ category_id: 'a' }))).toEqual(refused)
    expect(db.writes).toEqual([])
    expect(db.rpcArgs[0]).toEqual({ p_permission: 'manage_resource_categories' })
  })
})

describe('create and rename', () => {
  it('creates a category', async () => {
    expect(await createCategoryAction(null, form({ name: ' Crisis  Support ' }))).toEqual({ success: true })
    expect(db.writes[0]).toMatchObject({ op: 'insert', row: { name: 'Crisis Support', created_by: 'u1' } })
  })
  it('ties a duplicate or empty name to the name field', async () => {
    expect(await createCategoryAction(null, form({ name: 'facilitator kits' }))).toEqual({
      error: 'A category called "Facilitator Kits" already exists.',
      fieldErrors: { name: 'A category called "Facilitator Kits" already exists.' },
    })
    expect((await renameCategoryAction(null, form({ category_id: 'a', name: '' })))?.fieldErrors).toEqual({ name: 'Category name is required.' })
    expect(db.writes).toEqual([])
  })
  it('renames', async () => {
    expect(await renameCategoryAction(null, form({ category_id: 'a', name: 'Kits' }))).toEqual({ success: true })
    expect(db.writes[0]).toEqual({ op: 'update', row: { name: 'Kits' }, id: 'a' })
  })
})

describe('deactivate and delete', () => {
  it('deactivates and reactivates', async () => {
    expect(await setCategoryActiveAction(null, form({ category_id: 'a', active: 'false' }))).toEqual({ success: true })
    expect(db.writes[0]).toEqual({ op: 'update', row: { is_active: false }, id: 'a' })
  })
  it("won't delete a category that is in use", async () => {
    db.inUse = 3
    expect(await deleteCategoryAction(null, form({ category_id: 'a' }))).toEqual({
      error: "This category is used by 3 resources, so it can't be deleted. Deactivate it instead.",
    })
    expect(db.writes).toEqual([])
  })
  it('deletes an unused category', async () => {
    expect(await deleteCategoryAction(null, form({ category_id: 'a' }))).toEqual({ success: true })
    expect(db.writes[0]).toEqual({ op: 'delete', id: 'a' })
  })
})
