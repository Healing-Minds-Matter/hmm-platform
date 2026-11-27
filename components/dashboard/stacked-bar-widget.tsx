'use client'

import { useState } from 'react'
import { ScrollTable } from '@/components/scroll-table'
import type { StackedItem } from '@/actions/dashboard'

const MAX_VISIBLE = 10

type SortKey = 'name' | 'active' | 'inactive' | 'total'
type SortDir = 'asc' | 'desc'

function ViewAllModal({
  open,
  onClose,
  data,
}: {
  open: boolean
  onClose: () => void
  data: StackedItem[]
}) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  if (!open) return null

  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'name') return a.club_name.localeCompare(b.club_name) * mul
    if (sortKey === 'active') return (a.active - b.active) * mul
    if (sortKey === 'inactive') return (a.inactive - b.inactive) * mul
    return ((a.active + a.inactive) - (b.active + b.inactive)) * mul
  })

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Gatekeeper Activity by Club — All Clubs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>
        <ScrollTable label="All clubs" minWidth={480} className="overflow-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="cursor-pointer select-none px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800" onClick={() => toggle('name')}>
                  Club{arrow('name')}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[#0D8275] hover:opacity-80" onClick={() => toggle('active')}>
                  Active{arrow('active')}
                </th>
                <th className="cursor-pointer select-none px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800" onClick={() => toggle('inactive')}>
                  Inactive{arrow('inactive')}
                </th>
                <th className="cursor-pointer select-none px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800" onClick={() => toggle('total')}>
                  Total{arrow('total')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map(row => (
                <tr key={row.club_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-900">{row.club_name}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-[#0D8275]">{row.active}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-500">{row.inactive}</td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-gray-700">{row.active + row.inactive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </div>
    </div>
  )
}

function ActivityCard({ item }: { item: StackedItem }) {
  const total = item.active + item.inactive
  const activePct = total > 0 ? Math.round((item.active / total) * 100) : 0
  const activeBarPct = total > 0 ? (item.active / total) * 100 : 0

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[#F9F9F9] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#0F172A]">{item.club_name}</span>
        <span className="text-[11px] font-bold text-[#0D8275]">{activePct}% Active</span>
      </div>
      <div className="flex h-[10px] w-full overflow-hidden rounded-md bg-[#E2E8F0]">
        {total > 0 && (
          <>
            <div className="h-full bg-[#F4AC1E]" style={{ width: `${activeBarPct}%` }} />
            <div className="h-full flex-1 bg-[#CBD5E1]" />
          </>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#F4AC1E]">{item.active} Active</span>
        <span className="text-[#64748B]">{item.inactive} Inactive ({total} Total)</span>
      </div>
    </div>
  )
}

export function StackedBarWidget({ data }: { data: StackedItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = data.slice(0, MAX_VISIBLE)
  const hasMore = data.length > MAX_VISIBLE

  return (
    <>
      <div className="flex flex-col rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Gatekeeper Activity by Club</h2>
            <p className="mt-0.5 text-[11px] text-[#64748B]">Ratio of active vs paused/inactive personnel by facility.</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F6F5F5] px-3 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 font-bold text-[#0F172A]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#F4AC1E]" />
              Active
            </span>
            <span className="flex items-center gap-1.5 font-medium text-[#64748B]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#CBD5E1]" />
              Inactive / Paused
            </span>
          </div>
        </div>
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No data yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {visible.map(item => (
              <ActivityCard key={item.club_id} item={item} />
            ))}
          </div>
        )}
        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-4 self-start text-xs font-bold text-[#1E4BB8] hover:underline"
          >
            View All ({data.length} clubs) →
          </button>
        )}
      </div>
      <ViewAllModal open={showAll} onClose={() => setShowAll(false)} data={data} />
    </>
  )
}
