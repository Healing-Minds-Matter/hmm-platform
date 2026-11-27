import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatOrgDate } from '@/lib/org-date'
import { DelegationEndButton } from './delegation-end-button'

function statusOf(startsAt: string, endsAt: string, endedEarlyAt: string | null, endedReason: string | null, delegatorActive: boolean) {
  if (endedEarlyAt) {
    return endedReason === 'delegator_deactivated'
      ? { label: 'Ended (delegator deactivated)', cls: 'bg-gray-100 text-gray-600' }
      : { label: 'Ended Early', cls: 'bg-gray-100 text-gray-600' }
  }
  if (!delegatorActive) return { label: 'Ended (delegator deactivated)', cls: 'bg-gray-100 text-gray-600' }
  const now = new Date()
  if (new Date(startsAt) > now) return { label: 'Scheduled', cls: 'bg-yellow-100 text-yellow-700' }
  if (new Date(endsAt) <= now) return { label: 'Expired', cls: 'bg-gray-100 text-gray-600' }
  return { label: 'Active', cls: 'bg-green-100 text-green-700' }
}

export default async function DelegationsPage() {
  const supabase = await createClient()

  const { data: delegations } = await supabase
    .from('role_delegations')
    .select(`
      id, starts_at, ends_at, ended_early_at, ended_reason,
      delegator:profiles!role_delegations_delegator_id_fkey(full_name, is_active),
      delegate:profiles!role_delegations_delegate_id_fkey(full_name)
    `)
    .order('starts_at', { ascending: false })

  const rows = (delegations ?? []).map(d => ({
    ...d,
    delegator: Array.isArray(d.delegator) ? d.delegator[0] : d.delegator,
    delegate: Array.isArray(d.delegate) ? d.delegate[0] : d.delegate,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <p className="text-[13px] leading-5 text-[#475569]">
          A delegate temporarily gains their delegator&apos;s full effective permission set, in
          addition to their own, for the scheduled window.
        </p>
        <Link
          href="/super-admin/permissions/delegations/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-on-amber shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Create Delegation
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">No delegations yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-left text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="px-6 py-3">Delegator</th>
                <th className="px-6 py-3">Delegate</th>
                <th className="px-6 py-3">Starts</th>
                <th className="px-6 py-3">Ends</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {rows.map(d => {
                const status = statusOf(d.starts_at, d.ends_at, d.ended_early_at, d.ended_reason, d.delegator?.is_active ?? true)
                const canEnd = !d.ended_early_at && (d.delegator?.is_active ?? true) && new Date(d.ends_at) > new Date()
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-[13px] font-semibold text-[#0F172A]">{d.delegator?.full_name ?? '—'}</td>
                    <td className="px-6 py-4 text-[13px] text-[#475569]">{d.delegate?.full_name ?? '—'}</td>
                    <td className="px-6 py-4 text-[13px] text-[#475569]">
                      {formatOrgDate(d.starts_at, { dateStyle: 'medium' })}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#475569]">
                      {formatOrgDate(d.ends_at, { dateStyle: 'medium' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      {canEnd && <DelegationEndButton delegationId={d.id} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
