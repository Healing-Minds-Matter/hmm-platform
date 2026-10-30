'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { EventClubsField, type ClubOption } from '@/app/(dashboard)/super-admin/events/event-clubs-field'
import { createAnnouncementAction } from '@/actions/announcements'

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

const TOOLBAR_ACTIONS: { key: string; icon: string; iconClass: string; wrap: (selected: string) => { before: string; after: string; placeholder: string } }[] = [
  { key: 'bold', icon: '/icons/toolbar-bold.svg', iconClass: 'h-[9px] w-[7px]', wrap: () => ({ before: '**', after: '**', placeholder: 'bold text' }) },
  { key: 'italic', icon: '/icons/toolbar-italic.svg', iconClass: 'h-[9px] w-[9px]', wrap: () => ({ before: '_', after: '_', placeholder: 'italic text' }) },
  { key: 'bullet', icon: '/icons/toolbar-bullet.svg', iconClass: 'h-[11px] w-3', wrap: () => ({ before: '- ', after: '', placeholder: 'list item' }) },
  { key: 'numbered', icon: '/icons/toolbar-numbered.svg', iconClass: 'h-[13px] w-3', wrap: () => ({ before: '1. ', after: '', placeholder: 'list item' }) },
  { key: 'link', icon: '/icons/toolbar-link.svg', iconClass: 'h-[7px] w-[13px]', wrap: () => ({ before: '[', after: '](https://)', placeholder: 'link text' }) },
]

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

export function CreateAnnouncementForm({
  clubs,
  onClose,
}: {
  clubs: ClubOption[]
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/announcements'))
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, null)
  const submit = useSubmitWithoutReset(formAction)

  const [audience, setAudience] = useState('all')
  const [priority, setPriority] = useState('standard')
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [hasExpiry, setHasExpiry] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function applyToolbarAction(action: typeof TOOLBAR_ACTIONS[number]) {
    const textarea = bodyRef.current
    if (!textarea) return
    const { before, after, placeholder } = action.wrap('')
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = textarea.value
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    textarea.value = next
    textarea.focus()
    const cursor = start + before.length + selected.length
    textarea.setSelectionRange(cursor, cursor)
  }

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 tracking-[-0.22px] text-[#0F172A]">Create New Announcement</h1>
          <p className="max-w-[480px] text-[13px] leading-[18px] text-[#64748B]">
            Broadcast news, protocol updates, and event alerts across the platform
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
        <input type="hidden" name="audience" value={audience} />
        <input type="hidden" name="priority" value={priority} />
        <input type="hidden" name="is_pinned" value={isPinned ? 'true' : ''} />
        {scheduleMode === 'now' && <input type="hidden" name="publish_date" value={todayInputValue()} />}

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
                id="title"
                name="title"
                type="text"
                required
                autoComplete="off"
                placeholder="e.g. Mandatory QPR Recertification Window & Protocol Updates"
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">Target Audience &amp; Visibility</h3>
              <div className="flex gap-2.5">
                {AUDIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value)}
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
                  <EventClubsField clubs={clubs} label="Clubs" />
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
                    onClick={() => setPriority(opt.value)}
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
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="body" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Announcement Content <span className="text-[#DC2626]">*</span>
                </label>
                <span className="text-xs text-[#64748B]">Markdown / Rich Text</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#F8FAFC] bg-[#F8FAFC]">
                <div className="flex items-center gap-1 border-b border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-1.5">
                  {TOOLBAR_ACTIONS.map((action, i) => (
                    <span key={action.key} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => applyToolbarAction(action)}
                        className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white"
                        aria-label={action.key}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={action.icon} alt="" className={action.iconClass} />
                      </button>
                      {(i === 1 || i === 3) && <span className="mx-1 h-4 w-px bg-[#E2E8F0]" />}
                    </span>
                  ))}
                </div>
                <textarea
                  ref={bodyRef}
                  id="body"
                  name="body"
                  rows={5}
                  required
                  placeholder="All certified peer advocates and clinical gatekeepers…"
                  className="w-full resize-none bg-[#F8FAFC] px-3 py-2.5 text-[13px] leading-[21px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
                />
              </div>
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
                    type="date"
                    name="publish_date"
                    required
                    min={todayInputValue()}
                    className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
              )}
              <div className="mt-2.5 flex items-center justify-between border-t border-[#E2E8F0] pt-2">
                <label className="flex items-center gap-2 text-[12px] text-[#475569]">
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
                    min={todayInputValue()}
                    className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={isPending}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/save-draft-icon.svg" alt="" width={10.5} height={13.5} />
            Save as Draft
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={isPending}
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
