'use client'

import { useState, useTransition } from 'react'
import { ScrollTable } from '@/components/scroll-table'
import type { BarItem, OnboardingFilter } from '@/actions/dashboard'
import { getOnboardingProgress } from '@/actions/dashboard'

const MAX_LEGEND = 4

const FILTER_LABELS: Record<OnboardingFilter, string> = {
  this_month:   'This Month',
  last_month:   'Last Month',
  this_quarter: 'This Quarter',
}

const VS_LABELS: Record<OnboardingFilter, string> = {
  this_month:   'vs last month',
  last_month:   'vs the month before',
  this_quarter: 'vs last quarter',
}

// Real hex values sampled directly from the Figma donut segment assets.
const SEGMENT_COLORS = ['#022C51', '#8DD0B2', '#DBEAFE', '#DFB879']
const OTHER_COLOR = '#CBD5E1'

function ViewAllModal({
  open,
  onClose,
  data,
}: {
  open: boolean
  onClose: () => void
  data: BarItem[]
}) {
  if (!open) return null
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-[#0F172A]">Club Onboarding Progress — All Clubs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>
        <ScrollTable label="All clubs" minWidth={360} className="overflow-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Club</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">New Gatekeepers</th>
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
        </ScrollTable>
      </div>
    </div>
  )
}

export function OnboardingWidget({
  initialData,
  initialMomChangePct,
}: {
  initialData: BarItem[]
  initialMomChangePct: number | null
}) {
  const [filter, setFilter] = useState<OnboardingFilter>('this_month')
  const [data, setData] = useState(initialData)
  const [momChangePct, setMomChangePct] = useState(initialMomChangePct)
  const [isPending, startTransition] = useTransition()
  const [showAll, setShowAll] = useState(false)

  const handleFilter = (next: OnboardingFilter) => {
    if (next === filter) return
    setFilter(next)
    startTransition(async () => {
      const fresh = await getOnboardingProgress(next)
      setData(fresh.items)
      setMomChangePct(fresh.momChangePct)
    })
  }

  // Real clubs with any onboarding this period, descending — a 0-count club
  // contributes nothing to a proportion chart, so it's excluded here (still
  // present in the "view all" table below).
  const withOnboarding = [...data].filter(d => d.count > 0).sort((a, b) => b.count - a.count)
  const total = withOnboarding.reduce((sum, d) => sum + d.count, 0)
  const top = withOnboarding.slice(0, MAX_LEGEND)
  const otherCount = withOnboarding.slice(MAX_LEGEND).reduce((sum, d) => sum + d.count, 0)

  const segments = [
    ...top.map((item, i) => ({ label: item.club_name, count: item.count, color: SEGMENT_COLORS[i] })),
    ...(otherCount > 0 ? [{ label: 'Other Clubs', count: otherCount, color: OTHER_COLOR }] : []),
  ]

  let cumulative = 0
  const gradientStops = segments.map(seg => {
    const start = total > 0 ? (cumulative / total) * 100 : 0
    cumulative += seg.count
    const end = total > 0 ? (cumulative / total) * 100 : 0
    return `${seg.color} ${start}% ${end}%`
  }).join(', ')

  const hasMore = data.length > 10

  return (
    <>
      <div className="flex h-full flex-col rounded-2xl bg-white p-5">
        <div className="mb-6 flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Club Onboarding Progress</h2>
          <div className="relative flex-shrink-0">
            <select
              value={filter}
              onChange={e => handleFilter(e.target.value as OnboardingFilter)}
              disabled={isPending}
              className="appearance-none rounded-lg bg-[#F9F9F9] py-1.5 pl-3 pr-7 text-[13px] text-[#0F172A] focus:outline-none disabled:opacity-60"
            >
              {(Object.keys(FILTER_LABELS) as OnboardingFilter[]).map(f => (
                <option key={f} value={f}>{FILTER_LABELS[f]}</option>
              ))}
            </select>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-2.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
          </div>
        </div>

        {total === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No data yet</p>
        ) : (
          <div className="flex items-center gap-6">
            <div
              className="relative h-[150px] w-[150px] flex-shrink-0 rounded-full"
              style={{ background: `conic-gradient(${gradientStops})` }}
            >
              <div className="absolute inset-[20px] flex flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="text-[28px] font-extrabold leading-none text-[#0F172A]">{total}</span>
                <span className="mt-1.5 text-[11px] font-medium leading-tight text-[#64748B]">
                  Gatekeepers<br />Onboarded
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {segments.map(seg => (
                <div key={seg.label} className="flex items-center gap-2 text-[13px]">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[#0F172A]">{seg.label}</span>
                  <span className="flex-shrink-0 font-extrabold text-black">{seg.count}</span>
                  <span className="w-9 flex-shrink-0 text-right text-[12px] font-semibold text-[#BAB8B3]">
                    {Math.round((seg.count / total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {momChangePct !== null && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#F6F5F5] p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[5px] bg-[#DBEAFE]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/users-filled-small.svg" alt="" width={14} height={14} />
              </span>
              <div className="flex flex-col">
                <span className={`text-[15px] font-extrabold ${momChangePct >= 0 ? 'text-[#0F172A]' : 'text-[#DC2626]'}`}>
                  {momChangePct >= 0 ? '+' : ''}{momChangePct}%
                </span>
                <span className="text-[11px] text-[#64748B]">
                  {momChangePct >= 0 ? 'More' : 'Fewer'} gatekeepers onboarded {filter === 'this_quarter' ? 'this quarter' : filter === 'last_month' ? 'last month' : 'this month'}
                </span>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/trend-growth.svg" alt="" width={16} height={16} />
              <span className="whitespace-nowrap text-[11px] text-[#64748B]">{VS_LABELS[filter]}</span>
            </div>
          </div>
        )}

        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-3 self-start text-xs font-bold text-[#1E4BB8] hover:underline"
          >
            View all {data.length} clubs →
          </button>
        )}
      </div>
      <ViewAllModal open={showAll} onClose={() => setShowAll(false)} data={data} />
    </>
  )
}
