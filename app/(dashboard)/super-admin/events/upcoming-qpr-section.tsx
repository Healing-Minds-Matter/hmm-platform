import Link from 'next/link'
import { formatOrgDate, formatOrgTime } from '@/lib/org-date'

interface QprEvent {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  venue: string
  club_name: string
  facilitator: string | null
  max_participants: number | null
}

function formatWhen(startsAt: string, endsAt: string | null) {
  // Shown in Sri Lanka time (see lib/org-date.ts).
  const dateLabel = formatOrgDate(startsAt, { month: 'short', day: 'numeric' })
  const startTime = formatOrgTime(startsAt, { hour: 'numeric', minute: '2-digit' })
  if (!endsAt) return `${dateLabel}, ${startTime}`
  const endTime = formatOrgTime(endsAt, { hour: 'numeric', minute: '2-digit' })
  return `${dateLabel}, ${startTime} – ${endTime}`
}

// Visual match for Figma's "Upcoming QPR Certifications" card (node 32:2690)
// — layout/spacing/colors/typography only. The seat-capacity bars,
// "Manage Cohort Capacities" action, and accreditation badge are
// deliberately NOT reproduced: there's no registration/RSVP tracking
// anywhere in the app (max_participants is a capacity cap, not an
// enrollment count), no Champion/Gatekeeper-side flow exists yet to
// generate a real registered count even if that table existed, and the
// accreditation claim is an organizational compliance assertion this app
// has no business asserting regardless of schema. The circular badge that
// showed a fabricated "Q4"/"Q5" cohort index in Figma is kept as a visual
// element but with a real certification icon instead of an invented label.
export function UpcomingQprSection({ events, total }: { events: QprEvent[]; total: number }) {
  if (events.length === 0) return null

  return (
    <div className="flex flex-col justify-between rounded-xl bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EFF4FF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/qpr-cert-icon.svg" alt="" className="h-[17px] w-[17px]" />
            </span>
            <div>
              <h2 className="text-[18px] font-bold leading-6 text-[#0F172A] font-[family-name:var(--font-jakarta)]">Upcoming QPR Certifications</h2>
              <p className="text-[12px] leading-4 text-[#64748B]">High priority gatekeeper accreditation cohorts</p>
            </div>
          </div>
          {total > events.length && (
            <Link
              href="/super-admin/events?view=agenda&type=qpr_session"
              className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:underline"
            >
              View All {total}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/view-all-arrow.svg" alt="" className="h-[10.667px] w-[10.667px]" />
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {events.map(ev => (
            <div key={ev.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] p-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(0,52,149,0.1)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/qpr-cert-icon.svg" alt="" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold tracking-[0.24px] leading-4 text-[#0F172A]">{ev.title}</p>
                  <p className="truncate text-[12px] leading-4 text-[#64748B]">
                    {ev.facilitator ? `Facilitator: ${ev.facilitator} • ` : ''}{ev.venue}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.44px] text-[#475569]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/qpr-clock-icon.svg" alt="" className="h-[13.333px] w-[13.333px]" />
                    {formatWhen(ev.starts_at, ev.ends_at)}
                  </p>
                </div>
              </div>
              {ev.max_participants && (
                <span className="flex-shrink-0 whitespace-nowrap text-[11px] font-bold tracking-[0.44px] text-[#0F172A]">
                  Capacity: {ev.max_participants}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
