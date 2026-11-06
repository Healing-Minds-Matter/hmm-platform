import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EVENTS_CATEGORY, ModuleCard, type ModuleItem } from './module-card'
import { UserLookupWidget } from './user-lookup-widget'

// The stored category text (permission_catalog.category). Titles shown on screen
// come from CATEGORY_META in module-card.tsx.
const SHOWN_CATEGORIES = [
  'Community & Gatekeeper Management',
  EVENTS_CATEGORY,
  'Club Communications & Broadcasts',
  'Learning Resources & Library',
]

function delegationStatus(startsAt: string, endsAt: string, endedEarlyAt: string | null, delegatorActive: boolean) {
  if (endedEarlyAt || !delegatorActive) return 'ended'
  const now = new Date()
  if (new Date(startsAt) > now) return 'scheduled'
  if (new Date(endsAt) <= now) return 'expired'
  return 'active'
}

export default async function PermissionsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const { role: roleParam } = await searchParams
  const selectedRole: 'champion' | 'gatekeeper' = roleParam === 'gatekeeper' ? 'gatekeeper' : 'champion'

  const supabase = await createClient()

  const [{ data: catalog }, { data: permRows }, { data: overrideRows }, { data: delegationRows }, { data: activeCounts }, { data: groups }] =
    await Promise.all([
      supabase
        .from('permission_catalog')
        .select('key, label, description, category, display_order, restricted_to')
        .lte('display_order', 10)
        .order('display_order'),
      supabase.from('permissions').select('role, permission, is_enabled').in('role', ['champion', 'gatekeeper']),
      supabase
        .from('role_overrides')
        .select('id, permission, is_enabled, updated_at, user:profiles!role_overrides_user_id_fkey(id, full_name, role, club:clubs!profiles_club_id_fkey(name))')
        .order('updated_at', { ascending: false }),
      supabase
        .from('role_delegations')
        .select('id, starts_at, ends_at, ended_early_at, delegator:profiles!role_delegations_delegator_id_fkey(is_active)'),
      supabase.from('profiles').select('role').in('role', ['champion', 'gatekeeper']).eq('is_active', true),
      supabase
        .from('permission_groups')
        .select('id, name, description, group_members(count)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(2),
    ])

  const enabledLookup: Record<string, Record<string, boolean>> = {}
  for (const row of permRows ?? []) {
    enabledLookup[row.permission] ??= {}
    enabledLookup[row.permission][row.role] = row.is_enabled
  }

  type OverrideUser = { id: string; full_name: string; role: string; club: { name: string } | { name: string }[] | null }
  const overrides = (overrideRows ?? []) as unknown as {
    id: string; permission: string; is_enabled: boolean; updated_at: string; user: OverrideUser | OverrideUser[] | null
  }[]
  const normalizedOverrides = overrides.map(o => ({
    ...o,
    user: Array.isArray(o.user) ? o.user[0] : o.user,
  }))

  function overrideCountsFor(key: string, role: 'champion' | 'gatekeeper') {
    const relevant = normalizedOverrides.filter(o => o.permission === key && o.user?.role === role)
    return {
      denied: relevant.filter(o => !o.is_enabled).length,
      granted: relevant.filter(o => o.is_enabled).length,
    }
  }

  const categorized = new Map<string, ModuleItem[]>()
  for (const cat of SHOWN_CATEGORIES) categorized.set(cat, [])
  for (const row of catalog ?? []) {
    const counts = overrideCountsFor(row.key, selectedRole)
    categorized.get(row.category)?.push({
      key: row.key,
      label: row.label,
      description: row.description,
      restrictedTo: row.restricted_to,
      isEnabled: row.restricted_to ? false : (enabledLookup[row.key]?.[selectedRole] ?? false),
      deniedOverrideCount: counts.denied,
      grantedOverrideCount: counts.granted,
    })
  }

  const shownKeys = new Set((catalog ?? []).map(c => c.key))
  const topEnabledCount = (role: 'champion' | 'gatekeeper') =>
    Array.from(shownKeys).filter(k => enabledLookup[k]?.[role]).length

  const activeDelegations = (delegationRows ?? []).filter(d => {
    const delegator = Array.isArray(d.delegator) ? d.delegator[0] : d.delegator
    return delegationStatus(d.starts_at, d.ends_at, d.ended_early_at, delegator?.is_active ?? true) === 'active'
  })

  const activeRoleUserCount = (activeCounts ?? []).filter(p => p.role === selectedRole).length
  const totalOverrideCount = normalizedOverrides.length
  const recentOverrides = normalizedOverrides.slice(0, 5)

  return (
    <div className="flex flex-col gap-5">
      {activeDelegations.length > 0 && (
        <div className="flex items-center gap-3 rounded-[6px] border border-[#FDE68A] bg-[#FFFBEB] p-4">
          <span className="text-[13px] text-[#92400E]">
            {activeDelegations.length} temporary role delegation{activeDelegations.length !== 1 ? 's are' : ' is'} active
            right now — any default change here also applies immediately to the delegate(s) borrowing that access.
          </span>
          <Link
            href="/super-admin/permissions/delegations"
            className="ml-auto whitespace-nowrap text-[12px] font-semibold text-[#92400E] hover:underline"
          >
            View delegations →
          </Link>
        </div>
      )}

      <div className="flex gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex w-full flex-col gap-4 rounded-[10px] border border-[#E2E8F0] bg-white p-[21px]">
            <div className="flex items-center justify-between">
              <div className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.6px] text-black">
                SELECT ROLE TO VIEW OR CUSTOMIZE:
              </div>
              <div className="flex gap-0.5 rounded-[10px] border border-[rgba(226,232,240,0.8)] bg-[#F1F5F9] p-[5px]">
                <Link
                  href="/super-admin/permissions?role=champion"
                  className={`flex items-center gap-2 rounded-[6px] px-4 py-2 text-[14px] font-semibold ${
                    selectedRole === 'champion' ? 'bg-white text-[#0F172A]' : 'text-[#475569]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/permissions/role-champion.svg" alt="" width={15} height={15} />
                  Champion Role
                  <span className="rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[12px] font-medium text-[#115E59]">
                    {topEnabledCount('champion')} Enabled
                  </span>
                </Link>
                <Link
                  href="/super-admin/permissions?role=gatekeeper"
                  className={`flex items-center gap-2 rounded-[6px] px-4 py-2 text-[14px] font-medium ${
                    selectedRole === 'gatekeeper' ? 'bg-white text-[#0F172A] font-semibold' : 'text-[#475569]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/permissions/role-gatekeeper.svg" alt="" width={12} height={15} />
                  Gatekeeper Role
                  <span className="rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[12px] font-medium text-[#115E59]">
                    {topEnabledCount('gatekeeper')} Enabled
                  </span>
                </Link>
              </div>
            </div>
            <div className="flex gap-3 rounded-[6px] border border-[rgba(204,251,241,0.8)] bg-[rgba(240,253,250,0.5)] p-[15px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/permissions/role-info.svg" alt="" width={15} height={17} className="mt-0.5 shrink-0" />
              <p className="text-[12px] leading-[19.5px] text-[#134E4A]">
                {selectedRole === 'champion' ? (
                  <>
                    <strong>Champions</strong> manage club operations, lead training sessions, and onboard community
                    gatekeepers. Changes made here automatically apply as the baseline for all {activeRoleUserCount} active
                    Champion{activeRoleUserCount !== 1 ? 's' : ''} nationwide.
                  </>
                ) : (
                  <>
                    <strong>Gatekeepers</strong> are certified community members who complete training and support their
                    club. Changes made here automatically apply as the baseline for all {activeRoleUserCount} active
                    Gatekeeper{activeRoleUserCount !== 1 ? 's' : ''} nationwide.
                  </>
                )}
              </p>
            </div>
          </div>

          {SHOWN_CATEGORIES.map(cat => (
            <ModuleCard key={cat} category={cat} items={categorized.get(cat) ?? []} role={selectedRole} />
          ))}

          <div className="flex w-full items-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-white p-[17px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/permissions/save-check.svg" alt="" width={13} height={13} />
            <p className="text-[12px] leading-4 text-[#64748B]">
              All changes save automatically and apply immediately to {activeRoleUserCount} active{' '}
              {selectedRole === 'champion' ? 'Champions' : 'Gatekeepers'} nationwide.
            </p>
          </div>
        </div>

        <div className="flex w-[340px] shrink-0 flex-col gap-6">
          <UserLookupWidget />

          <div className="flex w-full flex-col gap-4 rounded-[10px] border border-[#E2E8F0] bg-white p-[21px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/permissions/exceptions-icon.svg" alt="" width={15} height={17.5} />
                <h3 className="text-[14px] font-bold text-[#0F172A]">Active Exceptions</h3>
              </div>
              <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[12px] font-semibold text-[#92400E]">
                {totalOverrideCount} Override{totalOverrideCount !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[12px] leading-4 text-[#64748B]">
              Individual staff with custom permissions that differ from standard defaults.
            </p>
            {recentOverrides.length === 0 ? (
              <p className="text-[12px] text-[#94A3B8]">No individual exceptions active.</p>
            ) : (
              <div className="flex w-full flex-col gap-3">
                {recentOverrides.map(o => (
                  <div key={o.id} className="w-full rounded-[6px] border border-[rgba(226,232,240,0.8)] bg-[#F8FAFC] p-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[#0F172A]">{o.user?.full_name ?? 'Unknown user'}</span>
                      <span
                        className={`rounded-[2px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${
                          o.is_enabled ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#FFE4E6] text-[#9F1239]'
                        }`}
                      >
                        {o.is_enabled ? 'Granted' : 'Restricted'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-[#475569]">{o.permission}</p>
                    <div className="mt-1.5 flex items-center justify-between border-t border-[rgba(226,232,240,0.6)] pt-1.5">
                      <span className="text-[11px] text-[#64748B]">
                        {Array.isArray(o.user?.club) ? o.user?.club[0]?.name : o.user?.club?.name ?? '—'}
                      </span>
                      <Link href="/super-admin/permissions/exceptions" className="text-[11px] font-medium text-[#0F766E] hover:underline">
                        Manage
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/super-admin/permissions/exceptions/new"
              className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#E2E8F0] px-[13px] py-[9px] text-[12px] font-semibold text-[#334155] hover:bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/permissions/add-small-plus.svg" alt="" width={9.3} height={9.3} />
              Add Individual Exception
            </Link>
          </div>

          <div className="flex w-full flex-col gap-3 rounded-[10px] border border-[#E2E8F0] bg-white p-[21px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/permissions/groups-icon.svg" alt="" width={16.7} height={13.3} />
                <h3 className="text-[14px] font-bold text-[#0F172A]">Custom Groups</h3>
              </div>
              <Link href="/super-admin/permissions/groups" className="text-[12px] font-semibold text-[#0F766E] hover:underline">
                View All
              </Link>
            </div>
            {(!groups || groups.length === 0) ? (
              <p className="text-[12px] text-[#94A3B8]">No active permission groups yet.</p>
            ) : (
              <div className="flex w-full flex-col gap-2">
                {groups.map(g => {
                  const memberCount = Array.isArray(g.group_members) ? (g.group_members[0]?.count ?? 0) : 0
                  return (
                    <Link
                      key={g.id}
                      href={`/super-admin/permissions/groups/${g.id}`}
                      className="flex w-full items-center justify-between rounded-[6px] border border-[#F1F5F9] bg-[#F8FAFC] p-[11px] hover:bg-slate-100"
                    >
                      <div>
                        <p className="text-[12px] font-semibold text-[#1E293B]">{g.name}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {memberCount} Member{memberCount !== 1 ? 's' : ''}
                          {g.description ? ` • ${g.description}` : ''}
                        </p>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/permissions/chevron-small.svg" alt="" width={4.9} height={8} />
                    </Link>
                  )
                })}
              </div>
            )}
            <Link
              href="/super-admin/permissions/groups/new"
              className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#E2E8F0] px-[13px] py-[9px] text-[12px] font-semibold text-[#334155] hover:bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/permissions/create-group-icon.svg" alt="" width={16} height={10.7} />
              Create New Group
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
