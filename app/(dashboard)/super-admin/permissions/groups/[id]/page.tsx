import Link from 'next/link'
import { ScrollTable } from '@/components/scroll-table'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GroupPermissionControl } from './group-permission-control'
import { GroupMemberAddForm } from './group-member-add-form'
import { GroupMemberRemoveButton } from './group-member-remove-button'
import { GroupArchiveButton } from './group-archive-button'

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: group } = await supabase
    .from('permission_groups')
    .select('id, name, description, is_active')
    .eq('id', id)
    .single()

  if (!group) notFound()

  const [{ data: members }, { data: groupPerms }, { data: allActiveUsers }, { data: permissionRows }] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id, profiles!group_members_user_id_fkey(full_name, email, role)')
      .eq('group_id', id),
    supabase
      .from('group_permissions')
      .select('permission, is_enabled')
      .eq('group_id', id),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['champion', 'gatekeeper'])
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('permissions')
      .select('permission'),
  ])

  const memberRows = (members ?? []).map(m => ({
    user_id: m.user_id,
    profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
  }))
  const memberIds = new Set(memberRows.map(m => m.user_id))
  const availableUsers = (allActiveUsers ?? []).filter(u => !memberIds.has(u.id))

  const settingByPermission: Record<string, 'allow' | 'deny'> = {}
  for (const gp of groupPerms ?? []) {
    settingByPermission[gp.permission] = gp.is_enabled ? 'allow' : 'deny'
  }
  const permissionKeys = Array.from(new Set((permissionRows ?? []).map(p => p.permission))).sort()

  return (
    <div className="flex flex-col gap-6 font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 max-lg:flex-wrap">
        <div>
          <Link href="/super-admin/permissions/groups" className="text-[13px] font-semibold text-[#1E4BB8] hover:underline">
            ← Back to Groups
          </Link>
          <h1 className="mt-3 text-[22px] font-bold tracking-[-0.22px] text-[#0F172A] font-[family-name:var(--font-jakarta)]">
            {group.name}
          </h1>
          {group.description && <p className="mt-1 text-[13px] text-[#475569]">{group.description}</p>}
        </div>
        {group.is_active && <GroupArchiveButton groupId={group.id} />}
      </div>

      {!group.is_active && (
        <div className="rounded-lg bg-[#F1F5F9] p-3 text-[13px] text-[#475569]">
          This group is archived. Its permissions no longer apply to members.
        </div>
      )}

      <div>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
          Members ({memberRows.length})
        </h2>
        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {memberRows.length === 0 ? (
            <p className="p-6 text-sm text-[#94A3B8]">No members yet.</p>
          ) : (
            <ScrollTable label="Group members" minWidth={480}>
            <table className="w-full">
              <tbody className="divide-y divide-[#F1F5F9]">
                {memberRows.map(m => (
                  <tr key={m.user_id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-[13px] font-semibold text-[#0F172A]">{m.profile?.full_name ?? '—'}</td>
                    <td className="px-6 py-3 text-[13px] capitalize text-[#475569]">{m.profile?.role ?? '—'}</td>
                    <td className="px-6 py-3 text-right text-sm">
                      <GroupMemberRemoveButton groupId={group.id} userId={m.user_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </ScrollTable>
          )}
          {group.is_active && (
            <div className="border-t border-[#F1F5F9] p-4">
              <GroupMemberAddForm groupId={group.id} availableUsers={availableUsers} />
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Group Permissions</h2>
        <p className="mb-3 text-[13px] text-[#475569]">
          Allow/Deny here overrides the Role default for every member — Deny wins if the member is
          also in another group that Allows the same permission. Not Set defers to the Role default.
        </p>
        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          {permissionKeys.length === 0 ? (
            <p className="p-6 text-sm text-[#94A3B8]">No permissions configured yet.</p>
          ) : (
            <ScrollTable label="Group permissions" minWidth={420}>
            <table className="w-full">
              <tbody className="divide-y divide-[#F1F5F9]">
                {permissionKeys.map(key => (
                  <tr key={key} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-[13px] font-semibold text-[#0F172A]">{key}</td>
                    <td className="px-6 py-3 text-right">
                      <GroupPermissionControl
                        groupId={group.id}
                        permission={key}
                        initialSetting={settingByPermission[key] ?? 'unset'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </ScrollTable>
          )}
        </div>
      </div>
    </div>
  )
}
