'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BarItem } from '@/actions/dashboard'

const MAX_VISIBLE = 7
const CHART_HEIGHT = 180

type SortKey = 'name' | 'count'
type SortDir = 'asc' | 'desc'

function ViewAllModal({
  open,
  onClose,
  title,
  data,
}: {
  open: boolean
  onClose: () => void
  title: string
  data: BarItem[]
}) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  if (!open) return null

  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    return sortKey === 'name'
      ? a.club_name.localeCompare(b.club_name) * mul
      : (a.count - b.count) * mul
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
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-[#0F172A]">{title} — All Clubs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="cursor-pointer select-none px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800" onClick={() => toggle('name')}>
                  Club{arrow('name')}
                </th>
                <th className="cursor-pointer select-none px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800" onClick={() => toggle('count')}>
                  Count{arrow('count')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map(row => (
                <tr key={row.club_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-900">{row.club_name}</td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-gray-700">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Smallest "nice" step (1/2/5/10 × a power of 10) so the Y axis reads like
// 0/20/40/60/80 rather than an arbitrary max — matches the real design.
function niceStep(rough: number): number {
  if (rough <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / magnitude
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return niceNorm * magnitude
}

function VerticalBar({ item, scaleMax }: { item: BarItem; scaleMax: number }) {
  const pct = scaleMax > 0 ? Math.max((item.count / scaleMax) * 100, item.count > 0 ? 2 : 0) : 0
  return (
    <div className="flex flex-1 flex-col items-center justify-end" style={{ height: CHART_HEIGHT }}>
      <span className="mb-1 text-[8px] font-semibold text-[#7A859E]">{item.count}</span>
      <div className="w-full max-w-[45px] bg-[#022C51]" style={{ height: `${pct}%` }} />
    </div>
  )
}

export function BarChartWidget({ data }: { data: BarItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = data.slice(0, MAX_VISIBLE)
  const maxCount = Math.max(...data.map(d => d.count), 0)
  const hasMore = data.length > MAX_VISIBLE
  const average = data.length > 0 ? Math.round(data.reduce((sum, d) => sum + d.count, 0) / data.length) : 0

  const step = niceStep(maxCount / 4)
  const scaleMax = step * 4
  const gridLabels = [scaleMax, step * 3, step * 2, step, 0]

  return (
    <>
      <div className="flex h-full flex-col rounded-2xl bg-white p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Active Gatekeepers by Club</h2>
          {hasMore ? (
            <button
              onClick={() => setShowAll(true)}
              className="flex items-center gap-1 text-xs font-bold text-[#1E4BB8] hover:underline"
            >
              View all {data.length} clubs ↗
            </button>
          ) : (
            <Link
              href="/super-admin/clubs"
              className="flex items-center gap-1 text-xs font-bold text-[#1E4BB8] hover:underline"
            >
              View all clubs ↗
            </Link>
          )}
        </div>
        <p className="mb-4 text-[11px] text-[#64748B]">Descending order of active gatekeepers.</p>

        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No data yet</p>
        ) : (
          <>
            <div className="relative ml-6" style={{ height: CHART_HEIGHT }}>
              <div className="absolute -left-6 top-0 flex h-full flex-col justify-between text-right text-[8px] font-bold text-[#565555]">
                {gridLabels.map(v => <span key={v}>{v}</span>)}
              </div>
              {gridLabels.map(v => (
                <div
                  key={v}
                  className="absolute left-0 right-0 border-t border-[#E2E8F0]"
                  style={{ bottom: scaleMax > 0 ? `${(v / scaleMax) * 100}%` : 0 }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-1.5 px-1">
                {visible.map(item => <VerticalBar key={item.club_id} item={item} scaleMax={scaleMax} />)}
              </div>
            </div>
            <div className="ml-6 flex gap-1.5 px-1 pt-1.5">
              {visible.map(item => (
                <span key={item.club_id} className="flex-1 truncate text-center text-[7px] font-semibold text-[#0F172A]">
                  {item.club_name}
                </span>
              ))}
            </div>
          </>
        )}

        {data.length > 0 && (
          <div className="mt-4 border-t border-[#E2E8F0] pt-3 text-[11px] text-[#64748B]">
            Average: <span className="font-bold text-[#0F172A]">{average} gatekeeper{average !== 1 ? 's' : ''}</span> per club
          </div>
        )}
      </div>
      {hasMore && (
        <ViewAllModal open={showAll} onClose={() => setShowAll(false)} title="Active Gatekeepers by Club" data={data} />
      )}
    </>
  )
}
