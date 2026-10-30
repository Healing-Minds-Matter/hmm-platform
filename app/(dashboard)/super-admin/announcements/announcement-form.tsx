'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { EventClubsField, type ClubOption } from '@/app/(dashboard)/super-admin/events/event-clubs-field'
import { updateAnnouncementAction, type AnnouncementActionState } from '@/actions/announcements'

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users', caption: 'Admins & Field', icon: '/icons/audience-all.svg', iconClass: 'h-[10px] w-5' },
  { value: 'champions', label: 'Champions', caption: 'Peer advocates', icon: '/icons/audience-champions.svg', iconClass: 'h-[17px] w-[17.5px]' },
  { value: 'gatekeepers', label: 'Gatekeepers', caption: 'Clinical leads', icon: '/icons/audience-gatekeepers.svg', iconClass: 'h-[17px] w-[13px]' },
  { value: 'specific_clubs', label: 'Specific Cohort', caption: 'Selected clubs', icon: '/icons/audience-cohort.svg', iconClass: 'h-[13px] w-[18px]' },
]

const PRIORITY_OPTIONS = [
  { value: 'standard', label: 'Standard Notice', icon: '/icons/priority-standard.svg' },
  { value: 'mandatory', label: 'Mandatory / Sign-off', icon: '/icons/priority-mandatory.svg' },
  { value: 'urgent', label: 'Urgent Broadcast', icon: '/icons/priority-urgent.svg' },
]

export interface AnnouncementValues {
  id: string
  title: string
  body: string
  publish_date: string
  expiry_date: string | null
  priority: 'standard' | 'mandatory' | 'urgent'
  audience: 'all' | 'champions' | 'gatekeepers' | 'specific_clubs'
  status: 'draft' | 'published'
  is_all_clubs: boolean
  club_ids: string[] // "Specific Cohort" clubs
  is_pinned: boolean
}

function toDateInputValue(value: string) {
  return value.slice(0, 10)
}

export function AnnouncementForm({
  announcement,
  clubs,
  onClose,
}: {
  announcement: AnnouncementValues
  clubs: ClubOption[]
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/announcements'))
  const [state, formAction, isPending] = useActionState<AnnouncementActionState, FormData>(updateAnnouncementAction, null)
  const submit = useSubmitWithoutReset(formAction)
  const [audience, setAudience] = useState(announcement.audience)
  const [priority, setPriority] = useState(announcement.priority)
  const [status, setStatus] = useState(announcement.status)
  const [hasExpiry, setHasExpiry] = useState(!!announcement.expiry_date)
  const [isPinned, setIsPinned] = useState(announcement.is_pinned)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Edit Announcement</h1>
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
        <input type="hidden" name="announcement_id" value={announcement.id} />
          <input type="hidden" name="audience" value={audience} />
          <input type="hidden" name="priority" value={priority} />
          <input type="hidden" name="intent" value={status === 'draft' ? 'draft' : 'publish'} />
          <input type="hidden" name="is_pinned" value={isPinned ? 'true' : ''} />

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
            {state?.error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {state.error}
              </div>
            )}

            <div>
              <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Announcement Title <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                defaultValue={announcement.title}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">Target Audience &amp; Visibility</h3>
              <div className="flex gap-2.5">
                {AUDIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value as typeof audience)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      audience === opt.value ? 'border-[#4192DA] bg-[#F4F7FF]' : 'border-[#CBD5E1] hover:bg-slate-50'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={opt.icon} alt="" className={opt.iconClass} />
                    <span className="mt-1 text-[11px] font-semibold tracking-[0.44px] text-[#0F172A]">{opt.label}</span>
                    <span className="text-[10px] text-[#64748B]">{opt.caption}</span>
                  </button>
                ))}
              </div>
              {audience === 'specific_clubs' && (
                <div className="mt-1">
                  <EventClubsField clubs={clubs} label="Clubs" defaultAllClubs={announcement.is_all_clubs} defaultClubIds={announcement.club_ids} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">Priority &amp; Urgency Level</h3>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value as typeof priority)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[11px] font-semibold tracking-[0.44px] transition-colors ${
                      priority === opt.value
                        ? 'border-[#FFBA37] bg-[rgba(255,222,172,0.5)] text-[#281900] ring-2 ring-[#7E5700]'
                        : 'border-[#CBD5E1] text-[#475569] hover:bg-slate-50'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={opt.icon} alt="" className="h-3 w-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="body" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Announcement Content <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                id="body"
                name="body"
                rows={5}
                required
                defaultValue={announcement.body}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[13px] leading-[21px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="publish_date" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Publish Date <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="publish_date"
                  name="publish_date"
                  type="date"
                  required
                  defaultValue={toDateInputValue(announcement.publish_date)}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Status
                </label>
                <div className="flex h-10 items-center gap-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5">
                  <label className="flex items-center gap-1.5 text-[13px] text-[#0F172A]">
                    <input type="radio" checked={status === 'published'} onChange={() => setStatus('published')} className="h-3.5 w-3.5 accent-[#003495]" />
                    Published
                  </label>
                  <label className="flex items-center gap-1.5 text-[13px] text-[#0F172A]">
                    <input type="radio" checked={status === 'draft'} onChange={() => setStatus('draft')} className="h-3.5 w-3.5 accent-[#003495]" />
                    Draft
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[#F8FAFC] p-[15px]">
              <label className="flex items-center gap-2 text-[13px] text-[#0F172A]">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={e => setIsPinned(e.target.checked)}
                  className="h-[13px] w-[13px] accent-[#003495]"
                />
                <span className="font-medium">Pin to top of Gatekeeper feed</span>
              </label>
              <p className="mt-1 pl-[21px] text-[11px] text-[#64748B]">
                Shows in the featured carousel at the top of the mobile app&rsquo;s Announcements screen. Multiple announcements
                can be pinned at once.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-[13px] text-[#475569]">
                <input
                  type="checkbox"
                  checked={hasExpiry}
                  onChange={e => setHasExpiry(e.target.checked)}
                  className="h-[13px] w-[13px] accent-[#003495]"
                />
                Set expiration date (auto-archive after this date)
              </label>
              {hasExpiry && (
                <input
                  type="date"
                  name="expiry_date"
                  defaultValue={announcement.expiry_date ? toDateInputValue(announcement.expiry_date) : undefined}
                  className="mt-2 h-10 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              )}
            </div>
          </div>

        <div className="flex items-center gap-3 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-[#F1F5F9] px-5 py-2.5 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
        </div>
        </form>
      </div>
  )
}
