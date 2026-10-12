import Link from 'next/link'
import type { EventSummary } from '@/actions/champion-dashboard'
import { eventTypeStyle } from '@/app/(dashboard)/super-admin/events/event-type'
import { formatOrgDate, formatOrgTime, toOrgWallClock } from '@/lib/org-date'

function formatDateTime(iso: string) {
  // Shown in Sri Lanka time (see lib/org-date.ts).
  return {
    month: formatOrgDate(iso, { month: 'short' }, 'en-US').toUpperCase(),
    day: toOrgWallClock(iso).getUTCDate(),
    time: formatOrgTime(iso, { hour: 'numeric', minute: '2-digit' }, 'en-US'),
  }
}

// Figma showed "18 registered / Max capacity: 20" and, for completed
// sessions, "28 Attended" + "96% Satisfaction" + "View Attendee Feedback" —
// none of that is backed: event_registrations exists in the schema but has
// zero consuming UI anywhere (no Gatekeeper app to register from), and no
// satisfaction/rating column exists at all. Real fields only: type, date,
// venue, description, and max_participants (the actual cap, not a fake
// registered count against it).
function EventCard({ event }: { event: EventSummary }) {
  const style = eventTypeStyle(event.type)
  const { month, day, time } = formatDateTime(event.starts_at)

  return (
    <div className="flex items-start gap-3 rounded-xl bg-[rgba(241,245,249,0.7)] p-4">
      <div
        className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl"
        style={{ backgroundColor: style.pillBg }}
      >
        <span className="text-[10px] font-bold uppercase" style={{ color: style.pillText }}>{month}</span>
        <span className="font-[family-name:var(--font-jakarta)] text-lg font-semibold" style={{ color: style.pillText }}>{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>{style.label}</span>
          <span className="text-[12px] text-[#64748B]">{time} · {event.venue}</span>
        </div>
        <p className="mt-1 truncate text-[14px] font-bold text-[#0F172A]">{event.title}</p>
        {event.description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[#475569]">{event.description}</p>
        )}
        {event.max_participants && (
          <p className="mt-1 text-[11px] text-[#64748B]">Capacity: {event.max_participants}</p>
        )}
      </div>
    </div>
  )
}

export function ClubEventsSummary({
  upcoming,
  completed,
}: {
  upcoming: EventSummary[]
  completed: EventSummary[]
}) {
  return (
    <div className="rounded-2xl bg-white p-6">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="font-[family-name:var(--font-jakarta)] text-lg font-semibold text-[#0F172A]">
            Awareness Programs &amp; Club Events Summary
          </h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">Upcoming and recently completed sessions for your club</p>
        </div>
        <Link href="/champion/events" className="flex-shrink-0 rounded-xl bg-[#F1F5F9] px-3.5 py-2 text-[12px] font-semibold text-[#003495] hover:bg-[#E2E8F0]">
          View Club Calendar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
            Upcoming in Next 14 Days ({upcoming.length})
          </p>
          {upcoming.length === 0 ? (
            <p className="rounded-xl bg-[#F9F9F9] p-4 text-center text-[12px] text-[#64748B]">
              No upcoming events in the next 14 days.
            </p>
          ) : (
            upcoming.map(e => <EventCard key={e.id} event={e} />)
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
            Recently Completed Sessions
          </p>
          {completed.length === 0 ? (
            <p className="rounded-xl bg-[#F9F9F9] p-4 text-center text-[12px] text-[#64748B]">
              No sessions completed in the last 30 days.
            </p>
          ) : (
            completed.map(e => <EventCard key={e.id} event={e} />)
          )}
        </div>
      </div>
    </div>
  )
}
