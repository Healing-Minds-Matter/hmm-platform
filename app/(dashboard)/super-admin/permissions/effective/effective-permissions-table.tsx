import { ScrollTable } from '@/components/scroll-table'

export type PermissionSource = 'individual' | 'group' | 'role' | 'delegated'

export interface EffectiveRow {
  permission: string
  is_enabled: boolean
  source: PermissionSource
  source_detail: Record<string, unknown> | null
}

const SOURCE_LABEL: Record<PermissionSource, string> = {
  individual: 'Individual',
  group: 'Group',
  role: 'Role Default',
  delegated: 'Delegated',
}

const SOURCE_PILL: Record<PermissionSource, string> = {
  individual: 'bg-blue-100 text-blue-700',
  group: 'bg-purple-100 text-purple-700',
  role: 'bg-gray-100 text-gray-600',
  delegated: 'bg-amber-100 text-amber-700',
}

export function roleLabel(role: string) {
  return role === 'champion' ? 'Champion' : role === 'gatekeeper' ? 'Gatekeeper' : role
}

function whyText(row: EffectiveRow, roleName: string): string {
  const detail = row.source_detail ?? {}
  if (row.source === 'individual') return 'Set directly for this user, overriding any group or role default.'
  if (row.source === 'group') {
    const key = row.is_enabled ? 'allowing_groups' : 'denying_groups'
    const groups = (detail[key] as { id: string; name: string }[] | undefined) ?? []
    const names = groups.map(g => g.name).join(', ') || 'a group'
    return `${row.is_enabled ? 'Allowed' : 'Denied'} by group: ${names}.`
  }
  if (row.source === 'role') {
    if (detail.note) return `No ${roleName} role default configured for this permission — defaults to Deny.`
    return `Inherited from the ${roleName} role default.`
  }
  return ''
}

export function EffectivePermissionsTable({ rows, roleName }: { rows: EffectiveRow[]; roleName: string }) {
  const sorted = rows.slice().sort((a, b) => a.permission.localeCompare(b.permission))

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {sorted.length === 0 ? (
        <div className="p-12 text-center text-sm text-[#94A3B8]">
          No permissions apply to this user yet.
        </div>
      ) : (
        <ScrollTable label="Effective permissions" minWidth={640}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
              <th className="px-6 py-3">Permission</th>
              <th className="px-6 py-3">Effective Result</th>
              <th className="px-6 py-3">Layer</th>
              <th className="px-6 py-3">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {sorted.map(row => (
              <tr key={row.permission} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-[13px] font-semibold text-[#0F172A]">{row.permission}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${
                    row.is_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {row.is_enabled ? 'Allow' : 'Deny'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${SOURCE_PILL[row.source]}`}>
                    {SOURCE_LABEL[row.source]}
                  </span>
                </td>
                <td className="px-6 py-4 text-[13px] text-[#475569]">{whyText(row, roleName)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollTable>
      )}
    </div>
  )
}
