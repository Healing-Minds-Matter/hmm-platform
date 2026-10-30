'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { eventTypeStyle } from './event-type'
import { cancelEventAction } from '@/actions/events'
import { formatOrgDate, formatOrgTime } from '@/lib/org-date'

interface EventDetail {
  id: string
  title: string
  type: string
  starts_at: string
  ends_at: string | null
  venue: string
  description: string | null
  max_participants: number | null
  club_name: string
  facilitator: string | null
  virtual_link: string | null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{label}</dt>
      <dd className="mt-1 text-[14px] text-[#0F172A]">{value}</dd>
    </div>
  )
}

// editHref is only passed when the viewer may edit and cancel this event:
// a Super Admin (any event) or a Champion (events they created for their
// own club alone) — see canManageEvent in lib/event-clubs.ts.
export function EventDetailPanel({ event, closeHref, editHref }: { event: EventDetail; closeHref: string; editHref?: string }) {
  const style = eventTypeStyle(event.type)
  // Shown in Sri Lanka time (see lib/org-date.ts).
  const dateLabel = formatOrgDate(event.starts_at, { dateStyle: 'full' })
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const timeLabel = event.ends_at
    ? `${formatOrgTime(event.starts_at, timeOpts)} – ${formatOrgTime(event.ends_at, timeOpts)}`
    : formatOrgTime(event.starts_at, timeOpts)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(86,86,86,0.41)] p-4 backdrop-blur-sm font-[family-name:var(--font-inter)]">
      <Link href={closeHref} scroll={false} className="absolute inset-0" aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="mb-4 flex items-start justify-between">
          <span
            style={{ backgroundColor: style.pillBg, color: style.pillText }}
            className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px]"
          >
            {style.label}
          </span>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
          </Link>
        </div>

        <h2 className="text-[20px] font-bold text-[#0F172A] font-[family-name:var(--font-jakarta)]">{event.title}</h2>

        <dl className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Date & Time" value={`${dateLabel} · ${timeLabel}`} />
          <Field label="Venue" value={event.venue} />
          <Field label="Clubs" value={event.club_name} />
          <Field label="Facilitator" value={event.facilitator ?? 'Not specified'} />
          <Field label="Maximum Participants" value={event.max_participants ? String(event.max_participants) : 'Not specified'} />
          {event.virtual_link && <Field label="Link" value={event.virtual_link} />}
        </dl>

        {event.description && (
          <div className="mt-4">
            <dt className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-5 text-[#0F172A]">{event.description}</dd>
          </div>
        )}

        {cancelError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{cancelError}</div>
        )}

        {editHref && (
          <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] pt-4">
            {confirmCancel ? (
              <>
                <span className="mr-auto text-[12px] text-[#475569]">Cancel this event?</span>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="flex h-9 items-center rounded-lg bg-[#F1F5F9] px-3.5 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
                >
                  No
                </button>
                <form
                  action={(fd) => startTransition(async () => {
                    const result = await cancelEventAction(null, fd)
                    if (result?.success) router.push(closeHref)
                    else setCancelError(result?.error ?? 'The event could not be cancelled. Please try again.')
                  })}
                >
                  <input type="hidden" name="event_id" value={event.id} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex h-9 items-center rounded-lg bg-[#DC2626] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-60"
                  >
                    {isPending ? 'Cancelling…' : 'Yes, Cancel Event'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="flex h-9 items-center rounded-lg border border-[#FECACA] bg-white px-3.5 text-[13px] font-semibold text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
                >
                  Cancel Event
                </button>
                <Link
                  href={editHref}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#E09B0F]"
                >
                  Edit Event
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
