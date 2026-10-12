import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ExceptionFilters } from './exception-filters'
import { ExceptionRevokeButton } from './exception-revoke-button'

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  const { data: overrides } = await supabase
    .from('role_overrides')
    .select('id, user_id, permission, is_enabled, updated_at, profiles!role_overrides_user_id_fkey(full_name, email, role)')
    .order('updated_at', { ascending: false })

  let rows = (overrides ?? []).map(o => ({
    ...o,
    profile: Array.isArray(o.profiles) ? o.profiles[0] : o.profiles,
  }))

  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter(r =>
      r.profile?.full_name?.toLowerCase().includes(needle) ||
      r.permission.toLowerCase().includes(needle)
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] leading-5 text-[#475569]">
            Every user with an active individual exception — flagged here for periodic review, since
            these override both Group and Role defaults.
          </p>
          <Link
            href="/super-admin/permissions/exceptions/new"
            className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
            Add Individual Exception
          </Link>
        </div>
        <div className="border-t border-[#F1F5F9] pt-3">
          <ExceptionFilters q={q} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">
            {q ? 'No exceptions match your search.' : 'No individual exceptions are currently set.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Permission</th>
                <th className="px-6 py-3">Setting</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-[13px] font-semibold text-[#0F172A]">{r.profile?.full_name ?? '—'}</td>
                  <td className="px-6 py-4 text-[13px] capitalize text-[#475569]">{r.profile?.role ?? '—'}</td>
                  <td className="px-6 py-4 text-[13px] text-[#475569]">{r.permission}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${
                      r.is_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {r.is_enabled ? 'Allow' : 'Deny'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <ExceptionRevokeButton overrideId={r.id} userId={r.user_id} permission={r.permission} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
