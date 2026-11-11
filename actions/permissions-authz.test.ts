import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeDb, fakeClient, type FakeDb } from '@/lib/testing/fake-supabase'

// Review Finding 9: the permission actions check the caller first (an active
// Super Admin with a verified session — managing permissions is
// Super-Admin-only), and the server never writes the audit entry itself: the
// database does, in the same transaction, only when a row really changed
// (migration 20261113000005). Called as each kind of user, as a forged
// request would.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CLUB = id(901), SA = id(1), SA_OFF = id(2), CH = id(3), GK = id(4)
const GROUP = id(700), OVERRIDE = id(710), DELEGATION = id(720)

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, me: null as string | null }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(h.db, 'user', h.me) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient(h.db, 'admin') }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/login-redirect.server', () => ({ loginPath: async () => '/login' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) }) }))

import {
  updateRoleDefaultAction, revokeIndividualExceptionAction, archiveGroupAction, addGroupMemberAction,
  removeGroupMemberAction, setGroupPermissionAction, endDelegationAction, createGroupAction,
  createDelegationAction, grantIndividualExceptionAction, searchAssignableUsersAction,
} from '@/actions/permissions'
import { writeAuditLog } from '@/lib/audit'

const form = (f: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(f)) d.set(k, v); return d }
const permWrites = () => h.db.writes.filter(w => ['permissions', 'role_overrides', 'permission_groups', 'group_members', 'group_permissions', 'role_delegations'].includes(w.table))
const run = (p: Promise<unknown>) => p.catch((e: Error) => { if (!String(e.message).startsWith('NEXT_REDIRECT')) throw e })

beforeEach(() => {
  h.me = null
  vi.mocked(writeAuditLog).mockClear()
  const p = (pid: string, role: string, club_id: string | null, is_active = true) => ({ id: pid, role, club_id, is_active, full_name: 'X' })
  h.db = createFakeDb({
    profiles: [p(SA, 'super_admin', null), p(SA_OFF, 'super_admin', null, false), p(CH, 'champion', CLUB), p(GK, 'gatekeeper', CLUB)],
    permissions: [{ id: 'perm-1', role: 'gatekeeper', permission: 'view_event_calendar', is_enabled: true }],
    role_overrides: [{ id: OVERRIDE, user_id: GK, permission: 'view_event_calendar', is_enabled: false }],
    permission_groups: [{ id: GROUP, name: 'Leads', is_active: true }],
    group_members: [{ id: 'gm-1', group_id: GROUP, user_id: GK }],
    group_permissions: [{ id: 'gp-1', group_id: GROUP, permission: 'view_event_calendar', is_enabled: true }],
    role_delegations: [{ id: DELEGATION, delegator_id: CH, delegate_id: GK, ended_early_at: null }],
    permission_catalog: [{ key: 'view_event_calendar', label: 'View Event Calendar', restricted_to: null }],
  }, { list_effective_permissions: () => ({ data: [], error: null }) })
})

// The five actions the review named, plus the role-default toggle.
const CALLS: [string, () => Promise<unknown>][] = [
  ['updateRoleDefaultAction', () => updateRoleDefaultAction(form({ role: 'gatekeeper', permission: 'view_event_calendar', is_enabled: 'false' }))],
  ['revokeIndividualExceptionAction', () => revokeIndividualExceptionAction(form({ override_id: OVERRIDE, user_id: GK, permission: 'view_event_calendar' }))],
  ['archiveGroupAction', () => archiveGroupAction(form({ group_id: GROUP }))],
  ['removeGroupMemberAction', () => removeGroupMemberAction(form({ group_id: GROUP, user_id: GK }))],
  ['setGroupPermissionAction', () => setGroupPermissionAction(form({ group_id: GROUP, permission: 'view_event_calendar', setting: 'deny' }))],
  ['endDelegationAction', () => endDelegationAction(form({ delegation_id: DELEGATION }))],
  ['addGroupMemberAction', () => addGroupMemberAction(form({ group_id: GROUP, user_id: CH }))],
  ['createGroupAction', () => createGroupAction(null, form({ name: 'New group' }))],
  ['createDelegationAction', () => createDelegationAction(null, form({ delegator_id: CH, delegate_id: GK, starts_at: '2030-01-01', ends_at: '2030-01-10' }))],
  ['grantIndividualExceptionAction', () => grantIndividualExceptionAction(null, form({ user_id: GK, permissions: 'view_event_calendar', is_enabled: 'true' }))],
]

describe.each([
  ['not signed in', null],
  ['Gatekeeper', GK],
  ['Champion', CH],
  ['deactivated Super Admin', SA_OFF],
] as const)('%s', (_label, who) => {
  it.each(CALLS)('%s → nothing changed, no audit entry', async (_name, call) => {
    h.me = who
    await run(call())
    expect(permWrites()).toEqual([])
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('Super Admin without two-step verification (Review Finding 8)', () => {
  it.each(CALLS)('%s → nothing changed', async (_name, call) => {
    h.me = SA
    h.db.aal = 'aal1'
    await run(call())
    expect(permWrites()).toEqual([])
  })
})

describe('Super Admin (verified)', () => {
  it.each(CALLS)('%s → the change is made with the caller’s own client; the server writes no audit entry (the database does)', async (_name, call) => {
    h.me = SA
    await run(call())
    expect(permWrites().length).toBeGreaterThan(0)
    expect(permWrites().every(w => w.client === 'user')).toBe(true)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('a no-op is not even written: role default already at that value', async () => {
    h.me = SA
    await updateRoleDefaultAction(form({ role: 'gatekeeper', permission: 'view_event_calendar', is_enabled: 'true' }))
    expect(permWrites()).toEqual([])
  })
  it('a no-op is not even written: group permission already at that setting', async () => {
    h.me = SA
    await setGroupPermissionAction(form({ group_id: GROUP, permission: 'view_event_calendar', setting: 'allow' }))
    await setGroupPermissionAction(form({ group_id: GROUP, permission: 'publish_club_announcements', setting: 'unset' }))
    expect(permWrites()).toEqual([])
  })
  it('forged ids or values → refused before the database is asked', async () => {
    h.me = SA
    await revokeIndividualExceptionAction(form({ override_id: 'not-a-uuid' }))
    await archiveGroupAction(form({ group_id: '1 OR 1=1' })).catch(() => undefined)
    await setGroupPermissionAction(form({ group_id: GROUP, permission: 'view_event_calendar', setting: 'maybe' }))
    await endDelegationAction(form({ delegation_id: '' }))
    await updateRoleDefaultAction(form({ role: 'super_admin', permission: 'view_event_calendar', is_enabled: 'true' }))
    expect(permWrites()).toEqual([])
  })
})

describe('searchAssignableUsersAction (read-only)', () => {
  it.each([['not signed in', null], ['Gatekeeper', GK], ['Champion', CH]] as const)('%s → no results', async (_l, who) => {
    h.me = who
    expect(await searchAssignableUsersAction('X X')).toEqual([])
  })
})
