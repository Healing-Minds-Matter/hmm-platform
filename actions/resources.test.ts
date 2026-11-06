import { beforeEach, describe, expect, it, vi } from 'vitest'

// Create/Edit Resource with managed categories (sheet row 26) and field-level
// errors (sheet row 32). The database is faked; its own rules (inactive
// category refused, in-use category can't be deleted) are in
// supabase/tests/resource-categories-rls.mjs.
const db = vi.hoisted(() => ({
  categories: [
    { id: 'active', name: 'Guides & Protocols', is_active: true },
    { id: 'retired', name: 'Training', is_active: false },
  ],
  existing: { category_id: 'retired', status: 'published', publication_date: '2026-01-01' } as Record<string, unknown>,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      if (table === 'resource_categories') return { select: async () => ({ data: db.categories }) }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: db.existing }) }) }),
        insert: (row: Record<string, unknown>) => {
          db.inserts.push(row)
          return { select: () => ({ single: async () => ({ data: { id: 'r1' }, error: null }) }) }
        },
        update: (row: Record<string, unknown>) => { db.updates.push(row); return { eq: async () => ({ error: null }) } },
      }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ remove: vi.fn() }) } }) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createResourceAction, updateResourceAction } from '@/actions/resources'

function articleForm(fields: Record<string, string>) {
  const f = new FormData()
  f.set('type', 'article')
  f.set('title', 'How to listen')
  f.set('content_text', 'Full text')
  f.set('publication_date', '2026-11-06')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => { db.inserts = []; db.updates = [] })

describe('create resource', () => {
  it('saves the chosen category id (the database fills in the name)', async () => {
    expect(await createResourceAction(null, articleForm({ category_id: 'active' }))).toEqual({ success: true })
    expect(db.inserts[0]).toMatchObject({ category_id: 'active' })
    expect(db.inserts[0]).not.toHaveProperty('category')
  })
  it('refuses a deactivated or unknown category, next to the Category field', async () => {
    expect(await createResourceAction(null, articleForm({ category_id: 'retired' }))).toEqual({
      error: 'The category "Training" has been deactivated. Choose an active category.',
      fieldErrors: { category_id: 'The category "Training" has been deactivated. Choose an active category.' },
    })
    expect((await createResourceAction(null, articleForm({ category_id: 'made-up' })))?.fieldErrors)
      .toEqual({ category_id: 'Choose a category from the list.' })
    expect(db.inserts).toEqual([])
  })
  it('ties missing required fields to their field', async () => {
    expect((await createResourceAction(null, articleForm({ category_id: 'active', title: '' })))?.fieldErrors)
      .toEqual({ title: 'Title is required.' })
    expect((await createResourceAction(null, articleForm({ category_id: 'active', content_text: '' })))?.fieldErrors)
      .toEqual({ content_text: 'Provide article content or an external link.' })
  })
})

describe('edit resource', () => {
  it('lets a resource keep its own deactivated category', async () => {
    const f = articleForm({ category_id: 'retired', resource_id: 'r1', intent: 'publish' })
    expect(await updateResourceAction(null, f)).toEqual({ success: true })
    expect(db.updates[0]).toMatchObject({ category_id: 'retired' })
  })
  it("won't move a resource to a deactivated category", async () => {
    db.existing = { ...db.existing, category_id: 'active' }
    const f = articleForm({ category_id: 'retired', resource_id: 'r1', intent: 'publish' })
    expect((await updateResourceAction(null, f))?.fieldErrors).toEqual({
      category_id: 'The category "Training" has been deactivated. Choose an active category.',
    })
    expect(db.updates).toEqual([])
  })
})
