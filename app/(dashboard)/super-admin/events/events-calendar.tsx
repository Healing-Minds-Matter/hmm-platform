'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { monthGridRange, weekRange, gridDays, dayKey, MONTH_NAMES, WEEKDAY_LABELS } from './date-grid'
import { formatOrgDate, formatOrgTime, toOrgWallClock } from '@/lib/org-date'
import { eventTypeStyle, EVENT_TYPE_STYLES } from './event-type'
import { EventDetailPanel } from './event-detail-panel'
import { UpcomingQprSection } from './upcoming-qpr-section'

interface EventItem {
  id: string
  title: string
  type: string
  starts_at: string
  ends_at: string | null
  venue: string
  description: string | null
  max_participants: number | null
  created_by: string
  club_name: string // the event's clubs, or "All clubs"
  facilitator: string | null
  virtual_link: string | null
}

interface ClubOption {
  id: string
  name: string
}

interface Props {
  view: 'month' | 'week' | 'agenda'
  year: number
  month: number
  day: number
  club: string
  type: string
  q: string
  events: EventItem[]
  clubs: ClubOption[]
  typeCounts: Record<string, number>
  totalCount: number
  // can_manage: decided on the server (lib/event-clubs canManageEvent) —
  // shows Edit / Cancel in the detail view.
  selectedEvent: (EventItem & { can_manage?: boolean }) | null
  generatedAt: string
  upcomingQpr: EventItem[]
  upcomingQprTotal: number
  basePath?: string
  newEventHref?: string
}

const EVENT_TYPES = [
  { value: 'qpr_session', label: EVENT_TYPE_STYLES.qpr_session.label },
  { value: 'awareness_program', label: EVENT_TYPE_STYLES.awareness_program.label },
  { value: 'workshop', label: EVENT_TYPE_STYLES.workshop.label },
  { value: 'other', label: EVENT_TYPE_STYLES.other.label },
]

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

function ymd(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function EventsCalendar({ view, year, month, day, club, type, q, events, clubs, typeCounts, totalCount, selectedEvent, generatedAt, upcomingQpr, upcomingQprTotal, basePath = '/super-admin/events', newEventHref }: Props) {
  const router = useRouter()

  function hrefWith(overrides: Partial<{ view: string; year: string; month: string; day: string; club: string; type: string; q: string; event: string }>) {
    const merged = {
      view: overrides.view ?? view,
      year: overrides.year ?? String(year),
      month: overrides.month ?? String(month),
      day: overrides.day ?? String(day),
      club: overrides.club ?? club,
      type: overrides.type ?? type,
      q: overrides.q ?? q,
      event: overrides.event ?? '',
    }
    const params = new URLSearchParams()
    if (merged.view !== 'month') params.set('view', merged.view)
    params.set('year', merged.year)
    params.set('month', merged.month)
    if (merged.view === 'week') params.set('day', merged.day)
    if (merged.club) params.set('club', merged.club)
    if (merged.type) params.set('type', merged.type)
    if (merged.q) params.set('q', merged.q)
    if (merged.event) params.set('event', merged.event)
    return `${basePath}?${params.toString()}`
  }

  const today = toOrgWallClock(new Date()) // Sri Lanka "today" (see lib/org-date.ts)
  const todayYmd = ymd(today)

  function goToday() {
    router.push(hrefWith({ year: String(todayYmd.year), month: String(todayYmd.month), day: String(todayYmd.day) }))
  }

  function goPrev() {
    if (view === 'week') {
      const d = new Date(Date.UTC(year, month - 1, day - 7))
      router.push(hrefWith(ymdOverrides(d)))
    } else {
      const prev = shiftMonth(year, month, -1)
      router.push(hrefWith({ year: String(prev.year), month: String(prev.month) }))
    }
  }

  function goNext() {
    if (view === 'week') {
      const d = new Date(Date.UTC(year, month - 1, day + 7))
      router.push(hrefWith(ymdOverrides(d)))
    } else {
      const next = shiftMonth(year, month, 1)
      router.push(hrefWith({ year: String(next.year), month: String(next.month) }))
    }
  }

  function ymdOverrides(d: Date) {
    const v = ymd(d)
    return { year: String(v.year), month: String(v.month), day: String(v.day) }
  }

  const activeTypeCount = type ? (typeCounts[type] ?? 0) : totalCount
  const usedTypes = EVENT_TYPES.filter(t => t.value === 'other' ? (typeCounts.other ?? 0) > 0 : true)

  const updatedLabel = formatOrgTime(generatedAt, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Events &amp; Calendar</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-[#EFF4FF] px-2.5 py-1 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
              <span className="h-2 w-2 rounded-full bg-[#64748B]" />
              <span className="text-[11px] font-semibold tracking-[0.44px] text-[#003495]">Updated {updatedLabel}</span>
            </span>
          </div>
          <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
            Comprehensive schedule of QPR certification sessions, awareness programs, and clinical workshops across all
            active clubs.
          </p>
        </div>
        <Link
          href={newEventHref ?? `${basePath}/new`}
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Schedule New Event
        </Link>
      </div>

      {/* Calendar Workspace Card */}
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-[27px]">
          <div className="flex items-center justify-between gap-3 pb-1">
            <div className="flex items-center gap-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/search-filter.svg" alt="" className="pointer-events-none absolute left-3 top-1/2 h-[12px] w-[12px] -translate-y-1/2" />
                <input
                  type="search"
                  defaultValue={q}
                  placeholder="Search event or venue..."
                  onChange={e => router.push(hrefWith({ q: e.target.value }))}
                  className="h-[34px] w-64 rounded-[5px] bg-[#F1F5F9] pl-8 pr-3 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
                />
              </div>
              <div className="relative">
                <select
                  value={type}
                  onChange={e => router.push(hrefWith({ type: e.target.value }))}
                  className="h-[34px] appearance-none rounded-[5px] bg-[#F1F5F9] pl-3 pr-7 text-[11px] font-semibold tracking-[0.44px] text-[#0F172A] focus:outline-none"
                >
                  <option value="">All Event Types ({totalCount})</option>
                  {EVENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label} ({typeCounts[t.value] ?? 0})</option>
                  ))}
                </select>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-2.5 top-1/2 h-[5px] w-[8px] -translate-y-1/2" />
              </div>
              <div className="relative">
                <select
                  value={club}
                  onChange={e => router.push(hrefWith({ club: e.target.value }))}
                  className="h-[34px] appearance-none rounded-[5px] bg-[#F1F5F9] pl-3 pr-7 text-[11px] font-semibold tracking-[0.44px] text-[#0F172A] focus:outline-none"
                >
                  <option value="">All Clubs</option>
                  {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-2.5 top-1/2 h-[5px] w-[8px] -translate-y-1/2" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {view !== 'agenda' && (
                <div className="flex h-[34px] items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5">
                  <button onClick={goToday} className="rounded-[4px] bg-white px-2 py-0.5 text-[11px] font-semibold tracking-[0.44px] text-[#0F172A] shadow-sm">
                    Today
                  </button>
                  <span className="mx-0.5 h-3.5 w-px bg-[#E2E8F0]" />
                  <button onClick={goPrev} aria-label="Previous" className="flex h-6 w-6 items-center justify-center rounded-[4px] hover:bg-white">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M6 1L2 4l4 3" stroke="#0F172A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <span className="min-w-[130px] px-1.5 text-center text-[15px] font-bold text-[#0F172A] font-[family-name:var(--font-jakarta)]">
                    {view === 'week'
                      ? weekLabel(year, month, day)
                      : `${MONTH_NAMES[month - 1]} ${year}`}
                  </span>
                  <button onClick={goNext} aria-label="Next" className="flex h-6 w-6 items-center justify-center rounded-[4px] hover:bg-white">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 1l4 3-4 3" stroke="#0F172A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              )}
              {view === 'agenda' && <h2 className="text-[15px] font-bold text-[#0F172A] font-[family-name:var(--font-jakarta)]">All Events</h2>}

              <div className="flex h-[34px] items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5">
                {(['month', 'week', 'agenda'] as const).map(v => (
                  <Link
                    key={v}
                    href={hrefWith({ view: v })}
                    scroll={false}
                    className={`rounded-[3px] px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] transition-colors ${
                      view === v ? 'bg-[#022C51] text-white shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'
                    }`}
                  >
                    {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Agenda'}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-[#F8FAFC] px-2.5 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.55px] text-[#64748B]">Legend:</span>
            {usedTypes.map(t => {
              const style = eventTypeStyle(t.value)
              return (
                <span key={t.value} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} />
                  <span className="text-[11px] font-semibold tracking-[0.44px] text-[#475569]">{style.label}</span>
                </span>
              )
            })}
          </div>
        </div>

        {view === 'month' && <MonthGrid year={year} month={month} events={events} hrefWith={hrefWith} todayYmd={todayYmd} />}
        {view === 'week' && <WeekGrid year={year} month={month} day={day} events={events} hrefWith={hrefWith} todayYmd={todayYmd} />}
        {view === 'agenda' && <AgendaView events={events} hrefWith={hrefWith} />}
      </div>

      <UpcomingQprSection events={upcomingQpr} total={upcomingQprTotal} />

      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          closeHref={hrefWith({ event: '' })}
          editHref={selectedEvent.can_manage ? `${basePath}/${selectedEvent.id}/edit` : undefined}
        />
      )}
    </div>
  )
}

function weekLabel(year: number, month: number, day: number) {
  const { start, end } = weekRange(new Date(Date.UTC(year, month - 1, day)))
  const startLabel = start.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const endLabel = end.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  return `${startLabel} – ${endLabel}`
}

// "+N more" in a Month view day box: opens a small list of all that day's
// events, each opening its details like any other event. Closes on Escape,
// on a click outside, or when an event is chosen. Opens towards the left for
// the right-hand columns so it doesn't run off the calendar.
function DayEventsList({
  dayDate, events, hrefWith, alignRight, open, onOpenChange,
}: {
  dayDate: Date
  events: EventItem[]
  hrefWith: (o: Partial<{ event: string }>) => string
  alignRight: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  // dayDate is a calendar ("wall-clock") day, so it's formatted as UTC.
  const dayLabel = dayDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

  return (
    <div ref={containerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="text-[10px] font-semibold text-[#64748B] hover:underline"
      >
        +{events.length - 1} more
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Events on ${dayLabel}`}
          className={`absolute top-full z-30 mt-1 w-64 rounded-lg bg-white p-3 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] ring-1 ring-[#E2E8F0] ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-[#0F172A]">{dayLabel}</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="flex h-5 w-5 items-center justify-center rounded text-[#64748B] hover:bg-[#F1F5F9]"
            >
              ×
            </button>
          </div>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto" onClick={() => onOpenChange(false)}>
            {events.map(ev => <EventPill key={ev.id} event={ev} href={hrefWith({ event: ev.id })} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function EventPill({ event, href, compact }: { event: EventItem; href: string; compact?: boolean }) {
  const style = eventTypeStyle(event.type)
  const time = formatOrgTime(event.starts_at, { hour: 'numeric', minute: '2-digit' }).replace(' ', '')
  return (
    <Link
      href={href}
      scroll={false}
      title={event.title}
      style={{ backgroundColor: style.pillBg, color: style.pillText }}
      className={`block w-full truncate rounded-[4px] px-1.5 py-0.5 text-left font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'}`}
    >
      {time} • {event.title}
    </Link>
  )
}

function MonthGrid({
  year, month, events, hrefWith, todayYmd,
}: {
  year: number
  month: number
  events: EventItem[]
  hrefWith: (o: Partial<{ event: string }>) => string
  todayYmd: { year: number; month: number; day: number }
}) {
  const { gridStart, gridEnd, firstOfMonth, lastOfMonth } = monthGridRange(year, month)
  const days = gridDays(gridStart, gridEnd)
  // Which day's "+N more" list is open (only one at a time).
  const [openDayKey, setOpenDayKey] = useState<string | null>(null)

  const eventsByDay: Record<string, EventItem[]> = {}
  for (const ev of events) {
    const key = dayKey(toOrgWallClock(ev.starts_at))
    eventsByDay[key] ??= []
    eventsByDay[key].push(ev)
  }

  return (
    // No overflow-hidden here: the "+N more" day list must be able to extend
    // past the bottom row. The header and grid below keep their own rounding.
    <div className="rounded-lg bg-white">
      <div className="flex gap-1 rounded-t-lg bg-[#F8FAFC] p-1">
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className="flex-1 py-1 text-center text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 rounded-b-lg bg-[#F8FAFC] p-1">
        {days.map((dayDate, index) => {
          const key = dayKey(dayDate)
          const inMonth = dayDate >= firstOfMonth && dayDate <= lastOfMonth
          const isToday = dayDate.getUTCFullYear() === todayYmd.year && dayDate.getUTCMonth() + 1 === todayYmd.month && dayDate.getUTCDate() === todayYmd.day
          const dayEvents = eventsByDay[key] ?? []
          return (
            <div
              key={key}
              className={`relative flex h-16 flex-col gap-1 rounded p-1.5 ${inMonth ? 'bg-white' : 'bg-white/60 opacity-45'} ${
                isToday ? 'ring-2 ring-[#003495]' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                {isToday ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#003495] text-[11px] font-bold text-white">
                    {dayDate.getUTCDate()}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold tracking-[0.44px] text-[#475569]">{dayDate.getUTCDate()}</span>
                )}
                {isToday && <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#003495]">Today</span>}
              </div>
              {dayEvents[0] && <EventPill event={dayEvents[0]} href={hrefWith({ event: dayEvents[0].id })} compact />}
              {/* A day box only fits one event. "+N more" used to open just the
                  second event, leaving a third or later unreachable — it now
                  opens a list of every event that day. */}
              {dayEvents.length > 1 && (
                <DayEventsList
                  dayDate={dayDate}
                  events={dayEvents}
                  hrefWith={hrefWith}
                  alignRight={index % 7 >= 4}
                  open={openDayKey === key}
                  onOpenChange={isOpen => setOpenDayKey(isOpen ? key : null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekGrid({
  year, month, day, events, hrefWith, todayYmd,
}: {
  year: number
  month: number
  day: number
  events: EventItem[]
  hrefWith: (o: Partial<{ event: string }>) => string
  todayYmd: { year: number; month: number; day: number }
}) {
  const { start } = weekRange(new Date(Date.UTC(year, month - 1, day)))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return d
  })

  const eventsByDay: Record<string, EventItem[]> = {}
  for (const ev of events) {
    const key = dayKey(toOrgWallClock(ev.starts_at))
    eventsByDay[key] ??= []
    eventsByDay[key].push(ev)
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white">
      <div className="grid grid-cols-7 gap-1 rounded-t-lg bg-[#F8FAFC] p-1">
        {days.map(d => {
          const isToday = d.getUTCFullYear() === todayYmd.year && d.getUTCMonth() + 1 === todayYmd.month && d.getUTCDate() === todayYmd.day
          return (
            <div key={dayKey(d)} className="flex flex-col items-center gap-0.5 py-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{WEEKDAY_LABELS[d.getUTCDay()]}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${isToday ? 'bg-[#003495] text-white' : 'text-[#0F172A]'}`}>
                {d.getUTCDate()}
              </span>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 gap-1 rounded-b-lg bg-[#F8FAFC] p-1">
        {days.map(d => {
          const key = dayKey(d)
          const dayEvents = eventsByDay[key] ?? []
          return (
            <div key={key} className="flex min-h-[220px] flex-col gap-1 rounded bg-white p-1.5">
              {dayEvents.length === 0 ? (
                <span className="pt-2 text-center text-[11px] text-[#CBD5E1]">—</span>
              ) : (
                dayEvents.map(ev => <EventPill key={ev.id} event={ev} href={hrefWith({ event: ev.id })} />)
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({
  events, hrefWith,
}: {
  events: EventItem[]
  hrefWith: (o: Partial<{ event: string }>) => string
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg bg-white p-12 text-center text-sm text-[#64748B]">
        No events match your filters.
      </div>
    )
  }

  let lastDateLabel = ''

  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-[#F1F5F9]">
      <ul className="divide-y divide-[#F1F5F9]">
        {events.map(ev => {
          const startsAt = ev.starts_at
          const dateLabel = formatOrgDate(startsAt, { dateStyle: 'full' })
          const showHeading = dateLabel !== lastDateLabel
          lastDateLabel = dateLabel
          const style = eventTypeStyle(ev.type)
          return (
            <li key={ev.id}>
              {showHeading && (
                <div className="bg-[#F8FAFC] px-6 py-2 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                  {dateLabel}
                </div>
              )}
              <Link href={hrefWith({ event: ev.id })} scroll={false} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: style.dot }} />
                <span className="w-16 flex-shrink-0 text-sm text-[#64748B]">
                  {formatOrgTime(startsAt, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-[#0F172A]">{ev.title}</span>
                <span className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                  {style.label}
                </span>
                <span className="flex-shrink-0 text-sm text-[#64748B]">{ev.club_name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
