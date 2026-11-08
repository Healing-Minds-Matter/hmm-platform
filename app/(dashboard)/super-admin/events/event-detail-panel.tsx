'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { eventTypeLabel, eventTypeStyle } from './event-type'
import { cancelEventAction } from '@/actions/events'
import { formatOrgDate, formatOrgTime } from '@/lib/org-date'

interface EventDetail {
  id: string
  title: string
  type: string
  type_description?: string | null
  starts_at: string
  ends_at: string | null
  venue: string
  description: string | null
  max_participants: number | null
  club_name: string
  facilitator: string | null
  virtual_link: string | null
  /** Sheet row 66: who registered (Super Admins: everyone; Champions: their own club). */
  registrants?: Registrant[]
  registrantsScope?: 'all' | 'own_club'
}

export type Registrant = { user_id: string; full_name: string; role: string; club_name: string | null; registered_at: string }

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
      <div role="dialog" aria-modal="true" aria-labelledby="event-detail-title" className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="mb-4 flex items-start justify-between">
          <span
            style={{ backgroundColor: style.pillBg, color: style.pillText }}
            className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px]"
          >
            {eventTypeLabel(event.type, event.type_description)}
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

        <h2 id="event-detail-title" className="text-[20px] font-bold text-[#0F172A] font-[family-name:var(--font-jakarta)]">{event.title}</h2>

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

        {event.registrants && <Registrations list={event.registrants} scope={event.registrantsScope ?? 'all'} />}

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

// Sheet row 66: name, club and registration date (Sri Lanka time), with the total.
function Registrations({ list, scope }: { list: Registrant[]; scope: 'all' | 'own_club' }) {
  return (
    <section className="mt-5 border-t border-[#E2E8F0] pt-4" aria-labelledby="event-registrations-title">
      <h3 id="event-registrations-title" className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
        Registrations ({list.length}){scope === 'own_club' ? ' — people from your club' : ''}
      </h3>
      {list.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#64748B]">{scope === 'own_club' ? 'No one from your club has registered yet.' : 'No one has registered yet.'}</p>
      ) : (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#E2E8F0]">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">People registered for this event</caption>
            <thead className="sticky top-0 bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-[0.44px] text-[#475569]">
              <tr>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Club</th>
                <th scope="col" className="px-3 py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.user_id} className="border-t border-[#F1F5F9]">
                  <td className="px-3 py-2 text-[#0F172A]">{r.full_name}{r.role === 'champion' ? ' (Champion)' : ''}</td>
                  <td className="px-3 py-2 text-[#475569]">{r.club_name ?? '—'}</td>
                  <td className="px-3 py-2 text-[#475569]">{formatOrgDate(r.registered_at, { dateStyle: 'medium' })}, {formatOrgTime(r.registered_at, { hour: 'numeric', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
