'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { describeGrantPlan, planExceptionGrant } from '@/lib/exception-grant'

export type PermissionActionState = { error?: string } | null

// ── Story 9.1: Role-Based Default Permissions ──────────────────────────────

export async function updateRoleDefaultAction(formData: FormData) {
  const role = formData.get('role') as string
  const permission = formData.get('permission') as string
  const isEnabled = formData.get('is_enabled') === 'true'

  if (role !== 'champion' && role !== 'gatekeeper') return
  if (!permission) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing } = await supabase
    .from('permissions')
    .select('id, is_enabled')
    .eq('role', role)
    .eq('permission', permission)
    .maybeSingle()

  const { data: saved, error } = await supabase
    .from('permissions')
    .upsert(
      { role, permission, is_enabled: isEnabled, updated_by: user.id },
      { onConflict: 'role,permission' }
    )
    .select('id')
    .single()

  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'permission.role_default_updated',
    entityType: 'permission',
    entityId: saved.id,
    details: { role, permission, prior_value: existing?.is_enabled ?? null, new_value: isEnabled },
  })

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'super_admin') return { error: 'Only Super Admins can grant exceptions.' }

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
    const { data: saved, error } = await supabase
      .from('role_overrides')
      .upsert(
        { user_id: userId, permission: item.key, is_enabled: isEnabled, updated_by: user.id },
        { onConflict: 'user_id,permission' }
      )
      .select('id')
      .single()
    if (error || !saved) { failed.push(`“${item.label}” (${error?.message ?? 'not saved'})`); continue }
    await writeAuditLog({
      actorId: user.id,
      action: 'permission.individual_exception_granted',
      entityType: 'role_override',
      entityId: saved.id,
      details: { user_id: userId, permission: item.key, is_enabled: isEnabled },
    })
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
  const overrideId = formData.get('override_id') as string
  const userId = formData.get('user_id') as string
  const permission = formData.get('permission') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('role_overrides').delete().eq('id', overrideId)
  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'permission.individual_exception_revoked',
    entityType: 'role_override',
    entityId: overrideId,
    details: { user_id: userId, permission },
  })

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: group, error } = await supabase
    .from('permission_groups')
    .insert({ name, description, created_by: user.id })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return invalid('name', `A group named "${name}" already exists.`)
    return { error: error.message }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'permission_group.created',
    entityType: 'permission_group',
    entityId: group.id,
    details: { name },
  })

  revalidatePath('/super-admin/permissions/groups')
  redirect(`/super-admin/permissions/groups/${group.id}`)
}

export async function archiveGroupAction(formData: FormData) {
  const groupId = formData.get('group_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('permission_groups').update({ is_active: false }).eq('id', groupId)

  await writeAuditLog({
    actorId: user.id,
    action: 'permission_group.archived',
    entityType: 'permission_group',
    entityId: groupId,
  })

  revalidatePath('/super-admin/permissions/groups')
  redirect('/super-admin/permissions/groups')
}

export async function addGroupMemberAction(formData: FormData) {
  const groupId = formData.get('group_id') as string
  const userId = formData.get('user_id') as string
  if (!userId) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, added_by: user.id })

  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'permission_group.member_added',
    entityType: 'permission_group',
    entityId: groupId,
    details: { user_id: userId },
  })

  revalidatePath(`/super-admin/permissions/groups/${groupId}`)
}

export async function removeGroupMemberAction(formData: FormData) {
  const groupId = formData.get('group_id') as string
  const userId = formData.get('user_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'permission_group.member_removed',
    entityType: 'permission_group',
    entityId: groupId,
    details: { user_id: userId },
  })

  revalidatePath(`/super-admin/permissions/groups/${groupId}`)
}

// setting = 'allow' | 'deny' | 'unset'
export async function setGroupPermissionAction(formData: FormData) {
  const groupId = formData.get('group_id') as string
  const permission = formData.get('permission') as string
  const setting = formData.get('setting') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing } = await supabase
    .from('group_permissions')
    .select('id, is_enabled')
    .eq('group_id', groupId)
    .eq('permission', permission)
    .maybeSingle()

  if (setting === 'unset') {
    if (existing) await supabase.from('group_permissions').delete().eq('id', existing.id)
  } else {
    await supabase
      .from('group_permissions')
      .upsert(
        { group_id: groupId, permission, is_enabled: setting === 'allow', updated_by: user.id },
        { onConflict: 'group_id,permission' }
      )
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'permission_group.permission_updated',
    entityType: 'permission_group',
    entityId: groupId,
    details: { permission, prior_value: existing?.is_enabled ?? null, new_setting: setting },
  })

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: delegation, error } = await supabase
    .from('role_delegations')
    .insert({ delegator_id: delegatorId, delegate_id: delegateId, starts_at: startsAt, ends_at: endsAt, created_by: user.id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: user.id,
    action: 'role_delegation.created',
    entityType: 'role_delegation',
    entityId: delegation.id,
    details: { delegator_id: delegatorId, delegate_id: delegateId, starts_at: startsAt, ends_at: endsAt },
  })

  revalidatePath('/super-admin/permissions/delegations')
  return { success: true }
}

export async function endDelegationAction(formData: FormData) {
  const delegationId = formData.get('delegation_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: delegation } = await supabase
    .from('role_delegations')
    .select('delegator_id, delegate_id, starts_at, ends_at')
    .eq('id', delegationId)
    .maybeSingle()

  const { error } = await supabase
    .from('role_delegations')
    .update({ ended_early_at: new Date().toISOString(), ended_reason: 'manual' })
    .eq('id', delegationId)

  if (error) return

  await writeAuditLog({
    actorId: user.id,
    action: 'role_delegation.ended_manually',
    entityType: 'role_delegation',
    entityId: delegationId,
    details: delegation
      ? {
          delegator_id: delegation.delegator_id,
          delegate_id: delegation.delegate_id,
          starts_at: delegation.starts_at,
          ends_at: delegation.ends_at,
        }
      : undefined,
  })

  revalidatePath('/super-admin/permissions/delegations')
}

/**
 * Called from deactivation flows (champions.ts, clubs.ts cascade) so any
 * delegation where the deactivated user is the delegator ends immediately
 * and gets an audit trail — the access itself already vanishes on the next
 * live check via v_active_role_delegations' is_active predicate; this only
 * concerns the recorded end-reason and audit log.
 */
export async function endDelegationsForDeactivatedUser(delegatorUserId: string, actorId: string) {
  const admin = createAdminClient()

  const { data: ended } = await admin
    .from('role_delegations')
    .update({ ended_early_at: new Date().toISOString(), ended_reason: 'delegator_deactivated' })
    .eq('delegator_id', delegatorUserId)
    .is('ended_early_at', null)
    .gt('ends_at', new Date().toISOString())
    .select('id, delegate_id')

  if (!ended || ended.length === 0) return

  await writeAuditLog({
    actorId,
    action: 'role_delegation.ended_delegator_deactivated',
    entityType: 'profile',
    entityId: delegatorUserId,
    details: { ended_delegation_ids: ended.map(d => d.id), delegate_ids: ended.map(d => d.delegate_id) },
  })
}
