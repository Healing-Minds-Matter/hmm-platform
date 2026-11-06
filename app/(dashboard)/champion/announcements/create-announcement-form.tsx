'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { createAnnouncementAction } from '@/actions/announcements'

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

// Deliberately no audience/priority pickers and no draft mode — the
// requirement doc's Champion scope is exactly "title, body text,
// announcement publication date, and an optional expiry date"; audience/
// priority/draft are Super-Admin-only concepts (see actions/announcements.ts
// resolveAnnouncementScope — a Champion's row is always forced to their own
// club regardless of what this form submits).
export function CreateAnnouncementForm({
  clubName,
  onClose,
}: {
  clubName: string
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/champion/announcements'))
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, null)
  const submit = useSubmitWithoutReset(formAction)

  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [hasExpiry, setHasExpiry] = useState(false)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 tracking-[-0.22px] text-[#0F172A]">Create New Announcement</h1>
          <p className="max-w-[480px] text-[13px] leading-[18px] text-[#64748B]">
            Share an update with {clubName}.
          </p>
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
        {scheduleMode === 'now' && <input type="hidden" name="publish_date" value={todayInputValue()} />}
        <input type="hidden" name="intent" value="publish" />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {state.error}
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div>
              <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Announcement Title <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="title" name="title" type="text" required autoComplete="off"
                placeholder="e.g. Upcoming Recertification Session"
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div>
              <label htmlFor="body" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Announcement Content <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                id="body" name="body" rows={5} required
                placeholder="Details for your club…"
                className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] leading-[21px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="rounded-xl bg-[#F8FAFC] p-[15px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/schedule-calendar.svg" alt="" className="h-[15px] w-[13.5px]" />
                  <span className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">Publication Schedule</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.44px] text-[#0F172A]">
                    <input type="radio" checked={scheduleMode === 'now'} onChange={() => setScheduleMode('now')} className="h-[13px] w-[13px] accent-[#003495]" />
                    Now
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.44px] text-[#475569]">
                    <input type="radio" checked={scheduleMode === 'later'} onChange={() => setScheduleMode('later')} className="h-[13px] w-[13px] accent-[#003495]" />
                    Schedule Later
                  </label>
                </div>
              </div>
              {scheduleMode === 'later' && (
                <div className="mt-2.5">
                  <input
                    type="date" name="publish_date" required min={todayInputValue()}
                    className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
              )}
              <div className="mt-2.5 flex items-center justify-between border-t border-[#E2E8F0] pt-2">
                <label className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <input
                    type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)}
                    className="h-[13px] w-[13px] accent-[#003495]"
                  />
                  Set expiration date (auto-archive after this date)
                </label>
                {hasExpiry && (
                  <input
                    type="date" name="expiry_date" min={todayInputValue()}
                    className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="button" onClick={close}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
          <button
            type="submit" disabled={isPending}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/publish-send.svg" alt="" width={11.5} height={8.5} />
            {isPending ? 'Publishing…' : 'Publish Announcement'}
          </button>
        </div>
      </form>
    </div>
  )
}
