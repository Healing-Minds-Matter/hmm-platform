'use client'

import { useState, useTransition } from 'react'
import { getUpcomingEvents } from '@/actions/dashboard'
import type { EventsData, EventsFilter } from '@/actions/dashboard'
import { EVENT_TYPE_STYLES } from '@/app/(dashboard)/super-admin/events/event-type'
import { formatOrgDate, formatOrgTime } from '@/lib/org-date'

const FILTER_LABELS: Record<EventsFilter, string> = {
  next_7_days:  '7d',
  next_30_days: '30d',
  all_upcoming: 'All',
}

const TYPE_SOLID: Record<string, { square: string; badge: string }> = {
  qpr_session:       { square: 'bg-blue-100',   badge: 'bg-blue-600' },
  awareness_program: { square: 'bg-purple-100', badge: 'bg-purple-600' },
  workshop:           { square: 'bg-green-100',  badge: 'bg-green-600' },
  other:              { square: 'bg-gray-100',   badge: 'bg-gray-500' },
}

function typeSolid(type: string) {
  return TYPE_SOLID[type] ?? TYPE_SOLID.other
}

function EventRow({ ev }: { ev: EventsData['events'][number] }) {
  // Shown in Sri Lanka time (see lib/org-date.ts).
  const dateLabel = formatOrgDate(ev.starts_at, { month: 'short', day: '2-digit' })
  const time = formatOrgTime(ev.starts_at, { hour: '2-digit', minute: '2-digit' })
  const style = EVENT_TYPE_STYLES[ev.type] ?? EVENT_TYPE_STYLES.other
  const solid = typeSolid(ev.type)

  return (
    <div className="flex w-full items-center justify-between rounded-xl bg-[#F6F5F5] p-2">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${solid.square}`}>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-[#0F172A]">{ev.title}</p>
          <p className="truncate text-[11px] text-[#64748B]">{ev.club_name} • {dateLabel}, {time}</p>
        </div>
      </div>
      <span className={`ml-2 flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-bold text-white ${solid.badge}`}>
        {style.label.replace(' Program', '').replace('QPR Certification Session', 'QPR')}
      </span>
    </div>
  )
}

export function EventsWidget({ initialData }: { initialData: EventsData }) {
  const [filter, setFilter] = useState<EventsFilter>('next_30_days')
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  const setAndFetch = (next: EventsFilter) => {
    if (next === filter) return
    setFilter(next)
    startTransition(async () => {
      const fresh = await getUpcomingEvents(next)
      setData(fresh)
    })
  }

  return (
    <div className="flex h-full flex-col rounded-2xl bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Upcoming Events</h2>
          <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#1E4BB8]">{data.total}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-[#E2E8F0] bg-[#F9F9F9] p-0.5">
          {(Object.keys(FILTER_LABELS) as EventsFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setAndFetch(f)}
              disabled={isPending}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                filter === f ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {data.events.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-gray-400">No upcoming events in this period</p>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5">
          {data.events.map(ev => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-[11px]">
        <span className="text-[#64748B]">{data.total} event{data.total !== 1 ? 's' : ''} in this period</span>
        <a href="/super-admin/events" className="flex items-center gap-1 font-bold text-[#1E4BB8] hover:underline">
          View Full Calendar →
        </a>
      </div>
    </div>
  )
}
