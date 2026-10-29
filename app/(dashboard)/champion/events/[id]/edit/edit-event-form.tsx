'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { updateEventAction } from '@/actions/events'
import { EVENT_TYPE_STYLES } from '@/app/(dashboard)/super-admin/events/event-type'
import { EventClubsField } from '@/app/(dashboard)/super-admin/events/event-clubs-field'

const TYPE_OPTIONS = [
  { value: 'qpr_session', label: 'QPR Session', caption: 'Certification & credits', dot: EVENT_TYPE_STYLES.qpr_session.dot },
  { value: 'awareness_program', label: 'Awareness', caption: 'Campus campaigns', dot: EVENT_TYPE_STYLES.awareness_program.dot },
  { value: 'workshop', label: 'Workshop', caption: 'Clinical & coping labs', dot: EVENT_TYPE_STYLES.workshop.dot },
  { value: 'other', label: 'Other', caption: 'Anything else', dot: EVENT_TYPE_STYLES.other.dot },
]

export interface EventValues {
  id: string
  title: string
  type: string
  event_date: string
  start_time: string
  end_time: string
  venue: string
  facilitator: string
  virtual_link: string
  max_participants: string
  description: string
  own_club: { id: string; name: string }
  club_ids: string[] // the event's current clubs
}

export function EditEventForm({
  event,
  fallbackPath = '/champion/events',
  onClose,
}: {
  event: EventValues
  fallbackPath?: string
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(fallbackPath))
  const [state, formAction, isPending] = useActionState(updateEventAction, null)
  const submit = useSubmitWithoutReset(formAction)
  const [type, setType] = useState(event.type)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 text-[#0F172A]">Edit Event</h1>
          <p className="max-w-[480px] text-[12px] leading-4 text-[#64748B]">Update this event&apos;s details.</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
        <input type="hidden" name="event_id" value={event.id} />
        <input type="hidden" name="type" value={type} />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>
          )}

          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div>
              <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Event Title <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="title" name="title" type="text" required autoComplete="off" defaultValue={event.title}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">Event Type</h3>
              <div className="grid grid-cols-4 gap-2.5">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                      type === opt.value ? 'border-[#6586C2] bg-[rgba(0,52,149,0.05)]' : 'border-[#E2E8F0] bg-[rgba(248,250,252,0.5)] hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: opt.dot }} />
                      <span className="text-[12px] font-bold text-[#0F172A]">{opt.label}</span>
                    </div>
                    <span className="text-[10px] text-[#64748B]">{opt.caption}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="event_date" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Event Date <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="event_date" name="event_date" type="date" required defaultValue={event.event_date}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <div>
                <label htmlFor="start_time" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Start Time <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="start_time" name="start_time" type="time" required defaultValue={event.start_time}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <div>
                <label htmlFor="end_time" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  End Time
                </label>
                <input
                  id="end_time" name="end_time" type="time" defaultValue={event.end_time}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <EventClubsField ownClub={event.own_club} defaultClubIds={event.club_ids} />
              <div>
                <label htmlFor="facilitator" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Primary Facilitator <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="facilitator" name="facilitator" type="text" required autoComplete="off" defaultValue={event.facilitator}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="venue" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Venue / Location <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="venue" name="venue" type="text" required autoComplete="off" defaultValue={event.venue}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="virtual_link" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Link
                </label>
                <input
                  id="virtual_link" name="virtual_link" type="text" autoComplete="off" defaultValue={event.virtual_link}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <div>
                <label htmlFor="max_participants" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Maximum Participants
                </label>
                <input
                  id="max_participants" name="max_participants" type="number" min={1} autoComplete="off" defaultValue={event.max_participants}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Description &amp; Objectives
              </label>
              <textarea
                id="description" name="description" rows={3} defaultValue={event.description}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
            Cancel
          </button>
          <button
            type="submit" disabled={isPending}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {!isPending && <img src="/icons/check.svg" alt="" width={11.55} height={8.52} />}
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
