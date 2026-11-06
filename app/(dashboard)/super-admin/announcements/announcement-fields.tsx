'use client'

// Parts of the announcement form shared by Create and Edit, in both portals
// (sheet rows 38, 61, 71, 72).

import { useEffect, useState, useTransition } from 'react'
import { FieldError } from '@/components/field-error'
import { countAnnouncementRecipientsAction, listCohortPeopleAction } from '@/actions/announcements'
import { isoToOrgDateTime } from '@/lib/org-date'
import { orgDateOf } from '@/lib/announcement-schedule'

type Person = { id: string; full_name: string; role: string; club_id: string }

// ── People inside the chosen clubs (row 38) ─────────────────────────────────
// Optional: with nobody ticked, everyone in the chosen clubs receives it.
export function CohortPeopleField({
  clubIds,
  selected,
  onChange,
}: {
  clubIds: string[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [loadedFor, setLoadedFor] = useState('')
  const [query, setQuery] = useState('')
  const [, startTransition] = useTransition()
  const key = [...clubIds].sort().join(',')

  useEffect(() => {
    let live = true
    startTransition(async () => {
      const list = await listCohortPeopleAction(key ? key.split(',') : [])
      if (!live) return
      setPeople(list)
      setLoadedFor(key)
    })
    return () => { live = false }
  }, [key])

  // People no longer in the chosen clubs are dropped from the selection.
  const valid = new Set(people.map(p => p.id))
  const chosen = loadedFor === key ? selected.filter(id => valid.has(id)) : selected

  const q = query.trim().toLowerCase()
  const shown = people.filter(p => !q || p.full_name.toLowerCase().includes(q))
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id])

  if (!clubIds.length) return null
  return (
    <fieldset className="mt-2.5">
      <legend className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
        Specific people <span className="font-normal text-[#64748B]">(optional)</span>
      </legend>
      {chosen.map(id => <input key={id} type="hidden" name="recipient_ids" value={id} />)}
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
        <p className="mb-2 text-[11px] text-[#64748B]">
          Leave everyone unticked to send it to all Champions and Gatekeepers in the chosen club{clubIds.length === 1 ? '' : 's'}.
        </p>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="mb-2 h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
        />
        <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto">
          {loadedFor !== key ? (
            <p className="col-span-2 text-[12px] text-[#64748B]">Loading people…</p>
          ) : shown.length === 0 ? (
            <p className="col-span-2 text-[12px] text-[#64748B]">{people.length ? `No one matches “${query}”.` : 'No active Champions or Gatekeepers in the chosen clubs.'}</p>
          ) : (
            shown.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-[#0F172A]">
                <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 flex-shrink-0 rounded border-[#D4D7E3]" />
                <span className="truncate">{p.full_name} <span className="text-[11px] text-[#64748B]">· {p.role === 'champion' ? 'Champion' : 'Gatekeeper'}</span></span>
              </label>
            ))
          )}
        </div>
        <p className="mt-2 text-[11px] text-[#94A3B8]">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'person' : 'people'} picked.` : 'Everyone in the chosen clubs.'}</p>
      </div>
      <FieldError name="recipient_ids" />
    </fieldset>
  )
}

// ── "This will reach N people" (row 38) ─────────────────────────────────────
export function RecipientCount({ audience, allClubs, clubIds, recipientIds }: {
  audience: string
  allClubs: boolean
  clubIds: string[]
  recipientIds: string[]
}) {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const key = JSON.stringify([audience, allClubs, [...clubIds].sort(), [...recipientIds].sort()])

  useEffect(() => {
    let live = true
    const timer = setTimeout(async () => {
      const [a, all, clubs, people] = JSON.parse(key) as [string, boolean, string[], string[]]
      const r = await countAnnouncementRecipientsAction({ audience: a, allClubs: all, clubIds: clubs, recipientIds: people })
      if (!live) return
      if ('count' in r) { setCount(r.count); setFailed(false) } else setFailed(true)
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [key])

  const needsClubs = audience === 'specific_clubs' && !allClubs && clubIds.length === 0
  return (
    <p aria-live="polite" className="rounded-lg bg-[#EFF4FF] px-3 py-2 text-[12px] font-medium text-[#1E4BB8]">
      {needsClubs ? 'Choose at least one club to see how many people this reaches.'
        : failed ? "Couldn't count the recipients right now."
        : count === null ? 'Counting recipients…'
        : `This announcement will reach ${count} ${count === 1 ? 'person' : 'people'} (each receives it once).`}
    </p>
  )
}

// ── Publication schedule and expiry (rows 71, 72) ───────────────────────────
// Times are Sri Lanka time. lib/announcement-schedule.ts checks the same rules
// on the server.
const dateInput = 'h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]'

export function ScheduleFields({ publishIso, expiryIso, defaultMode = 'now' }: {
  /** Edit: the stored publication moment. */
  publishIso?: string | null
  expiryIso?: string | null
  defaultMode?: 'now' | 'later'
}) {
  const today = orgDateOf(new Date())
  const pub = publishIso ? isoToOrgDateTime(publishIso) : null
  const exp = expiryIso ? isoToOrgDateTime(expiryIso) : null
  const [mode, setMode] = useState<'now' | 'later'>(pub ? 'later' : defaultMode)
  const [pubDate, setPubDate] = useState(pub?.date ?? '')
  const [hasExpiry, setHasExpiry] = useState(!!exp)
  // An already-live announcement keeps its (past) date unless changed.
  const minDate = pub && pub.date < today ? pub.date : today

  return (
    <div className="rounded-xl bg-[#F8FAFC] p-[15px]">
      <input type="hidden" name="schedule_mode" value={mode} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/schedule-calendar.svg" alt="" className="h-[15px] w-[13.5px]" />
          <span id="schedule-heading" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">Publication Schedule</span>
        </div>
        <div role="radiogroup" aria-labelledby="schedule-heading" className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.44px] text-[#0F172A]">
            <input type="radio" name="schedule_mode_choice" checked={mode === 'now'} onChange={() => setMode('now')} className="h-[13px] w-[13px] accent-[#003495]" />
            Now
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.44px] text-[#475569]">
            <input type="radio" name="schedule_mode_choice" checked={mode === 'later'} onChange={() => setMode('later')} className="h-[13px] w-[13px] accent-[#003495]" />
            {pub ? 'Date & time' : 'Schedule Later'}
          </label>
        </div>
      </div>
      {mode === 'later' && (
        <div className="mt-2.5 flex flex-wrap items-start gap-3">
          <div>
            <label htmlFor="publish_date" className="mb-1 block text-[11px] font-medium text-[#475569]">Date <span className="text-[#DC2626]">*</span></label>
            <input id="publish_date" type="date" name="publish_date" required min={minDate} value={pubDate} onChange={e => setPubDate(e.target.value)} className={dateInput} />
            <FieldError name="publish_date" />
          </div>
          <div>
            <label htmlFor="publish_time" className="mb-1 block text-[11px] font-medium text-[#475569]">
              Time (Sri Lanka) {pubDate === today && <span className="text-[#DC2626]">*</span>}
            </label>
            <input id="publish_time" type="time" name="publish_time" required={pubDate === today} defaultValue={pub?.time ?? ''} className={dateInput} aria-describedby="publish-time-hint" />
            <p id="publish-time-hint" className="mt-1 text-[11px] text-[#94A3B8]">{pubDate === today ? 'Required today — later than now.' : 'Optional — start of the day if left empty.'}</p>
            <FieldError name="publish_time" />
          </div>
        </div>
      )}
      <div className="mt-2.5 border-t border-[#E2E8F0] pt-2">
        <label className="flex items-center gap-2 text-[12px] text-[#475569]">
          <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="h-[13px] w-[13px] accent-[#003495]" />
          Set expiration date (auto-archive after this date and time)
        </label>
        {hasExpiry && (
          <div className="mt-2 flex flex-wrap items-start gap-3">
            <div>
              <label htmlFor="expiry_date" className="mb-1 block text-[11px] font-medium text-[#475569]">Expiry date <span className="text-[#DC2626]">*</span></label>
              <input id="expiry_date" type="date" name="expiry_date" required min={mode === 'later' && pubDate ? pubDate : today} defaultValue={exp?.date ?? ''} className={dateInput} />
              <FieldError name="expiry_date" />
            </div>
            <div>
              <label htmlFor="expiry_time" className="mb-1 block text-[11px] font-medium text-[#475569]">Time (Sri Lanka)</label>
              <input id="expiry_time" type="time" name="expiry_time" defaultValue={exp?.time ?? ''} className={dateInput} aria-describedby="expiry-time-hint" />
              <p id="expiry-time-hint" className="mt-1 text-[11px] text-[#94A3B8]">Optional — end of the day if left empty.</p>
              <FieldError name="expiry_time" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
