'use server'

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { requirePermissionManager, type Caller } from '@/lib/auth/guards.server'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { describeGrantPlan, planExceptionGrant } from '@/lib/exception-grant'

export type PermissionActionState = { error?: string } | null

// Review Finding 9: every action here checks the caller first (an active
// Super Admin with a verified session), then makes the change with the
// caller's own client, so the database rules apply too. The server writes no
// audit entries for these changes: the database does, in the same
// transaction, only for rows that really changed, with the real caller as
// the actor (migration 20261113000005).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const PERMISSION_KEY_RE = /^[a-z0-9_.]{1,80}$/
const isPermissionKey = (v: unknown): v is string => typeof v === 'string' && PERMISSION_KEY_RE.test(v)

/** The caller, or null (after redirecting a signed-out caller to sign in). */
async function permissionManager(): Promise<Caller | null> {
  const guard = await requirePermissionManager()
  if (guard.ok) return guard.caller
  if (guard.reason === 'unauthenticated') redirect(await loginPath())
  return null
}

/** For actions that return a message: the caller, or the guard's message. */
async function permissionManagerOrError(): Promise<Caller | { error: string }> {
  const guard = await requirePermissionManager()
  if (guard.ok) return guard.caller
  if (guard.reason === 'unauthenticated') redirect(await loginPath())
  return { error: guard.message }
}

// ── Story 9.1: Role-Based Default Permissions ──────────────────────────────

export async function updateRoleDefaultAction(formData: FormData) {
  const role = formData.get('role') as string
  const permission = formData.get('permission') as string
  const isEnabled = formData.get('is_enabled') === 'true'

  if (role !== 'champion' && role !== 'gatekeeper') return
  if (!isPermissionKey(permission)) return

  const caller = await permissionManager()
  if (!caller) return
  const supabase = caller.supabase

  const { data: existing } = await supabase
    .from('permissions')
    .select('id, is_enabled')
    .eq('role', role)
    .eq('permission', permission)
    .maybeSingle()
  if (existing && existing.is_enabled === isEnabled) return // nothing to change

  const { error } = await supabase
    .from('permissions')
    .upsert(
      { role, permission, is_enabled: isEnabled, updated_by: caller.id },
      { onConflict: 'role,permission' }
    )
  if (error) return

  revalidatePath('/super-admin/permissions')
}

// ── Story 9.2: Individual Permission Exception ─────────────────────────────

export type ExceptionActionState = {
  error?: string
  fieldErrors?: FieldErrors
  success?: boolean
  /** Sheet row 60: what happened to each chosen permission, in plain English. */
  summary?: string[]
  /** True when everything chosen was saved (nothing skipped or refused). */
  allSaved?: boolean
} | null

// Sheet row 60: one or more permissions for one person. Skips permissions the
// person already has (or already doesn't, for Deny) and reports them, refuses
// Super-Admin-only keys (the database refuses them too), and writes one audit
// entry per permission saved.
export async function grantIndividualExceptionAction(
  _prev: ExceptionActionState,
  formData: FormData
): Promise<ExceptionActionState> {
  const userId = formData.get('user_id') as string
  const keys = formData.getAll('permissions').map(v => String(v))
  // Older form (single text field) still works.
  const single = (formData.get('permission') as string | null)?.trim()
  if (single) keys.push(single)
  const isEnabled = formData.get('is_enabled') === 'true'

  if (!userId) return invalid('user_id', 'Select a user.')
  if (!keys.some(k => k.trim())) return invalid('permissions', 'Choose at least one permission.')

  if (!isUuid(userId)) return invalid('user_id', 'Choose an active Champion or Gatekeeper.')

  const caller = await permissionManagerOrError()
  if ('error' in caller) return caller
  const supabase = caller.supabase

  const [{ data: target }, { data: catalog }, { data: effective }] = await Promise.all([
    supabase.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle(),
    supabase.from('permission_catalog').select('key, label, restricted_to'),
    supabase.rpc('list_effective_permissions', { p_user_id: userId }),
  ])
  if (!target || !target.is_active || !['champion', 'gatekeeper'].includes(target.role)) {
    return invalid('user_id', 'Choose an active Champion or Gatekeeper.')
  }

  const plan = planExceptionGrant(keys, isEnabled, catalog ?? [], (effective ?? []) as { permission: string; is_enabled: boolean }[])
  const failed: string[] = []
  for (const item of plan.toSave) {
    const { error } = await supabase
      .from('role_overrides')
      .upsert(
        { user_id: userId, permission: item.key, is_enabled: isEnabled, updated_by: caller.id },
        { onConflict: 'user_id,permission' }
      )
    if (error) { failed.push(`“${item.label}” (not saved)`); continue }
  }

  revalidatePath('/super-admin/permissions/exceptions')
  revalidatePath('/super-admin/permissions')
  const saved = { ...plan, toSave: plan.toSave.filter(t => !failed.some(f => f.startsWith(`“${t.label}”`))) }
  const summary = describeGrantPlan(saved, isEnabled)
  if (failed.length) summary.push(`Couldn’t save: ${failed.join(', ')}.`)
  if (!saved.toSave.length && (plan.skipped.length || plan.refused.length || failed.length)) {
    return { error: 'Nothing was changed.', summary }
  }
  return { success: true, summary, allSaved: !plan.skipped.length && !plan.refused.length && !failed.length }
}

export async function revokeIndividualExceptionAction(formData: FormData) {
  const overrideId = formData.get('override_id')
  if (!isUuid(overrideId)) return

  const caller = await permissionManager()
  if (!caller) return

  // Who and which permission come from the row itself (audited by the
  // database), not from the request.
  const { error } = await caller.supabase.from('role_overrides').delete().eq('id', overrideId)
  if (error) return

  revalidatePath('/super-admin/permissions/exceptions')
}

// ── Story 9.3: Permission Groups ────────────────────────────────────────────

// fieldErrors: errors tied to a form field, shown next to it (sheet row 32).
export type GroupActionState = { error?: string; fieldErrors?: FieldErrors } | null

export async function createGroupAction(
  _prev: GroupActionState,
  formData: FormData
): Promise<GroupActionState> {
  const name = (formData.get('name') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null

  if (!name) return invalid('name', 'Group name is required.')

  const caller = await permissionManagerOrError()
  if ('error' in caller) return caller

  const { data: group, error } = await caller.supabase
    .from('permission_groups')
    .insert({ name, description, created_by: caller.id })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return invalid('name', `A group named "${name}" already exists.`)
    return { error: 'The group couldn’t be created. Please try again.' }
  }

  revalidatePath('/super-admin/permissions/groups')
  redirect(`/super-admin/permissions/groups/${group.id}`)
}

export async function archiveGroupAction(formData: FormData) {
  const groupId = formData.get('group_id')
  if (!isUuid(groupId)) return

  const caller = await permissionManager()
  if (!caller) return

  const { error } = await caller.supabase.from('permission_groups').update({ is_active: false }).eq('id', groupId).eq('is_active', true)
  if (error) return

  revalidatePath('/super-admin/permissions/groups')
  redirect('/super-admin/permissions/groups')
}

export async function addGroupMemberAction(formData: FormData) {
  const groupId = formData.get('group_id')
  const userId = formData.get('user_id')
  if (!isUuid(groupId) || !isUuid(userId)) return

  const caller = await permissionManager()
  if (!caller) return

  const { error } = await caller.supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, added_by: caller.id })
  if (error) return

  revalidatePath(`/super-admin/permissions/groups/${groupId}`)
}

export async function removeGroupMemberAction(formData: FormData) {
  const groupId = formData.get('group_id')
  const userId = formData.get('user_id')
  if (!isUuid(groupId) || !isUuid(userId)) return

  const caller = await permissionManager()
  if (!caller) return

  const { error } = await caller.supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) return

  revalidatePath(`/super-admin/permissions/groups/${groupId}`)
}

// setting = 'allow' | 'deny' | 'unset'
export async function setGroupPermissionAction(formData: FormData) {
  const groupId = formData.get('group_id')
  const permission = formData.get('permission')
  const setting = formData.get('setting')
  if (!isUuid(groupId) || !isPermissionKey(permission)) return
  if (setting !== 'allow' && setting !== 'deny' && setting !== 'unset') return

  const caller = await permissionManager()
  if (!caller) return
  const supabase = caller.supabase

  const { data: existing } = await supabase
    .from('group_permissions')
    .select('id, is_enabled')
    .eq('group_id', groupId)
    .eq('permission', permission)
    .maybeSingle()

  if (setting === 'unset') {
    if (!existing) return // nothing to change
    await supabase.from('group_permissions').delete().eq('id', existing.id)
  } else {
    if (existing && existing.is_enabled === (setting === 'allow')) return // nothing to change
    await supabase
      .from('group_permissions')
      .upsert(
        { group_id: groupId, permission, is_enabled: setting === 'allow', updated_by: caller.id },
        { onConflict: 'group_id,permission' }
      )
  }

  revalidatePath(`/super-admin/permissions/groups/${groupId}`)
}

// ── Permissions dashboard: quick user lookup widget ─────────────────────────

export type AssignableUserMatch = {
  id: string
  full_name: string
  role: 'champion' | 'gatekeeper'
  club_name: string | null
  allowed_count: number
  total_count: number
}

export async function searchAssignableUsersAction(query: string): Promise<AssignableUserMatch[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const guard = await requirePermissionManager()
  if (!guard.ok) return []
  const supabase = guard.caller.supabase

  const { data: matches } = await supabase
    .from('profiles')
    .select('id, full_name, role, club:clubs!profiles_club_id_fkey(name)')
    .in('role', ['champion', 'gatekeeper'])
    .eq('is_active', true)
    .ilike('full_name', `%${trimmed}%`)
    .limit(5)

  if (!matches || matches.length === 0) return []

  const results: AssignableUserMatch[] = []
  for (const m of matches) {
    const club = Array.isArray(m.club) ? m.club[0] : m.club
    const { data: rows } = await supabase.rpc('list_effective_permissions', { p_user_id: m.id })
    const list = (rows ?? []) as { is_enabled: boolean }[]
    results.push({
      id: m.id,
      full_name: m.full_name,
      role: m.role as 'champion' | 'gatekeeper',
      club_name: club?.name ?? null,
      allowed_count: list.filter(r => r.is_enabled).length,
      total_count: list.length,
    })
  }
  return results
}

// ── Story 9.4: Temporary Role Delegation ────────────────────────────────────

export type DelegationActionState = { error?: string; fieldErrors?: FieldErrors; success?: boolean } | null

export async function createDelegationAction(
  _prev: DelegationActionState,
  formData: FormData
): Promise<DelegationActionState> {
  const delegatorId = formData.get('delegator_id') as string
  const delegateId = formData.get('delegate_id') as string
  const startsAt = formData.get('starts_at') as string
  const endsAt = formData.get('ends_at') as string

  if (!delegatorId) return invalid('delegator_id', 'Select the delegator (the person going on leave).')
  if (!delegateId) return invalid('delegate_id', 'Select the delegate (the person covering).')
  if (delegatorId === delegateId) return invalid('delegate_id', 'Delegator and delegate must be different people.')
  if (!startsAt) return invalid('starts_at', 'Start date is required.')
  if (!endsAt) return invalid('ends_at', 'End date is required.')
  if (new Date(endsAt) <= new Date(startsAt)) return invalid('ends_at', 'End date must be after the start date.')
  if (!isUuid(delegatorId)) return invalid('delegator_id', 'Select the delegator (the person going on leave).')
  if (!isUuid(delegateId)) return invalid('delegate_id', 'Select the delegate (the person covering).')
  if (Number.isNaN(new Date(startsAt).getTime())) return invalid('starts_at', 'Enter a valid start date.')
  if (Number.isNaN(new Date(endsAt).getTime())) return invalid('ends_at', 'Enter a valid end date.')

  const caller = await permissionManagerOrError()
  if ('error' in caller) return caller

  const { error } = await caller.supabase
    .from('role_delegations')
    .insert({ delegator_id: delegatorId, delegate_id: delegateId, starts_at: startsAt, ends_at: endsAt, created_by: caller.id })
  if (error) return { error: 'The delegation couldn’t be saved. Please try again.' }

  revalidatePath('/super-admin/permissions/delegations')
  return { success: true }
}

export async function endDelegationAction(formData: FormData) {
  const delegationId = formData.get('delegation_id')
  if (!isUuid(delegationId)) return

  const caller = await permissionManager()
  if (!caller) return

  // Only a delegation that hasn't already ended; ending it again changes nothing.
  const { error } = await caller.supabase
    .from('role_delegations')
    .update({ ended_early_at: new Date().toISOString(), ended_reason: 'manual' })
    .eq('id', delegationId)
    .is('ended_early_at', null)
  if (error) return

  revalidatePath('/super-admin/permissions/delegations')
}
