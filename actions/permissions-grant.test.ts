import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet row 60: Grant Exception for several permissions at once, called
// directly as a modified browser could.
const db = vi.hoisted(() => ({
  callerRole: 'super_admin',
  target: { id: 'gk-1', role: 'gatekeeper', is_active: true } as Record<string, unknown> | null,
  catalog: [
    { key: 'download_facilitator_kits', label: 'Download Gatekeeper Facilitator Kits', restricted_to: null },
    { key: 'publish_club_announcements', label: 'Publish Club Announcements', restricted_to: null },
    { key: 'view_event_calendar', label: 'View Event Calendar', restricted_to: null },
    { key: 'upload_clinical_guides', label: 'Upload Clinical Guides & Protocols', restricted_to: 'super_admin' },
  ],
  effective: [
    { permission: 'download_facilitator_kits', is_enabled: true },
    { permission: 'publish_club_announcements', is_enabled: false },
  ],
  upserts: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    rpc: async () => ({ data: db.effective }),
    from: (table: string) => {
      if (table === 'permission_catalog') return { select: async () => ({ data: db.catalog }) }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              single: async () => ({ data: { role: db.callerRole } }),
              maybeSingle: async () => ({ data: id === 'gk-1' ? db.target : null }),
            }),
          }),
        }
      }
      return {
        upsert: (row: Record<string, unknown>) => {
          db.upserts.push(row)
          return { select: () => ({ single: async () => ({ data: { id: `ov-${db.upserts.length}` }, error: null }) }) }
        },
      }
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async (e: Record<string, unknown>) => { db.audit.push(e) }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { grantIndividualExceptionAction } from '@/actions/permissions'

function form(keys: string[], allow = true, userId = 'gk-1') {
  const f = new FormData()
  f.set('user_id', userId)
  f.set('is_enabled', String(allow))
  for (const k of keys) f.append('permissions', k)
  return f
}

beforeEach(() => { db.callerRole = 'super_admin'; db.upserts = []; db.audit = [] })

describe('grant several permissions at once', () => {
  it('saves each new one and writes one audit entry per permission', async () => {
    const r = await grantIndividualExceptionAction(null, form(['publish_club_announcements', 'view_event_calendar']))
    expect(r).toMatchObject({ success: true, allSaved: true })
    expect(db.upserts.map(u => u.permission)).toEqual(['publish_club_announcements', 'view_event_calendar'])
    expect(db.audit).toHaveLength(2)
    expect(db.audit.map(a => (a.details as { permission: string }).permission)).toEqual(['publish_club_announcements', 'view_event_calendar'])
    expect(db.audit.every(a => a.action === 'permission.individual_exception_granted' && a.actorId === 'admin-1')).toBe(true)
  })

  it('skips what the person already has, and says so', async () => {
    const r = await grantIndividualExceptionAction(null, form(['download_facilitator_kits', 'view_event_calendar']))
    expect(r?.success).toBe(true)
    expect(r?.allSaved).toBe(false)
    expect(r?.summary).toContain('Skipped (already allowed): “Download Gatekeeper Facilitator Kits”.')
    expect(db.upserts.map(u => u.permission)).toEqual(['view_event_calendar'])
    expect(db.audit).toHaveLength(1)
  })

  it('refuses never-grantable keys and unknown keys', async () => {
    const r = await grantIndividualExceptionAction(null, form(['upload_clinical_guides', 'made_up_key']))
    expect(r?.error).toBe('Nothing was changed.')
    expect(r?.summary?.join(' ')).toMatch(/Upload Clinical Guides & Protocols” \(for Super Admins only/)
    expect(r?.summary?.join(' ')).toMatch(/made_up_key” \(not a known permission\)/)
    expect(db.upserts).toEqual([])
  })

  it('needs a user and at least one permission, tied to those fields', async () => {
    expect((await grantIndividualExceptionAction(null, form([])))?.fieldErrors).toEqual({ permissions: 'Choose at least one permission.' })
    expect((await grantIndividualExceptionAction(null, form(['view_event_calendar'], true, '')))?.fieldErrors).toEqual({ user_id: 'Select a user.' })
  })

  it('refuses a caller who is not a Super Admin', async () => {
    db.callerRole = 'champion'
    expect(await grantIndividualExceptionAction(null, form(['view_event_calendar']))).toEqual({ error: 'Only Super Admins can grant exceptions.' })
    expect(db.upserts).toEqual([])
  })

  it('refuses a person who is not an active Champion or Gatekeeper', async () => {
    expect((await grantIndividualExceptionAction(null, form(['view_event_calendar'], true, 'someone-else')))?.fieldErrors)
      .toEqual({ user_id: 'Choose an active Champion or Gatekeeper.' })
  })
})
