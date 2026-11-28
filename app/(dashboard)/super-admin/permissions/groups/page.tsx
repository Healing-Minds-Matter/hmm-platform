import Link from 'next/link'
import { ScrollTable } from '@/components/scroll-table'
import { createClient } from '@/lib/supabase/server'

export default async function GroupsPage() {
  const supabase = await createClient()

  const { data: groups } = await supabase
    .from('permission_groups')
    .select('id, name, description, is_active, group_members(count)')
    .order('name')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] max-lg:flex-wrap">
        <p className="text-[13px] leading-5 text-[#475569]">
          Grant the same permissions to multiple people at once — group settings override each
          member&apos;s Role default but are themselves overridden by any Individual Exception.
        </p>
        <Link
          href="/super-admin/permissions/groups/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-on-amber shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Create Group
        </Link>
      </div>

      {!groups || groups.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">No groups yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <ScrollTable label="Groups" minWidth={720}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Members</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {groups.map(g => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-[13px] font-semibold text-[#0F172A]">{g.name}</td>
                  <td className="px-6 py-4 text-[13px] text-[#475569]">{g.description ?? '—'}</td>
                  <td className="px-6 py-4 text-[13px] text-[#475569]">{g.group_members?.[0]?.count ?? 0}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${
                      g.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {g.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <Link href={`/super-admin/permissions/groups/${g.id}`} className="text-[13px] font-semibold text-[#1E4BB8] hover:underline">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </ScrollTable>
        </div>
      )}
    </div>
  )
}
