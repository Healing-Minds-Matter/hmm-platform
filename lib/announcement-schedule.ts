// When an announcement goes live and when it expires (sheet rows 71 and 72).
// Dates and times are typed in Sri Lanka time and stored as timestamptz (UTC).
//
// - "Publish now": goes live at the moment it's saved.
// - "Schedule later": a date, and a time. The time is required when the date
//   is today, and must then be later than now; for a later date it defaults
//   to the start of that day.
// - Expiry (optional): a date and optional time (default: the end of that
//   day). It must be after the publication date and time.
// - Editing: an unchanged publication time is kept even if it's now in the
//   past (the announcement is already live).
// The database applies the same rules (save_announcement, migration
// 20261110000001).

import { orgDateTimeToIso } from '@/lib/org-date'

export type ScheduleInput = {
  mode: 'now' | 'later'
  publishDate: string | null   // YYYY-MM-DD
  publishTime: string | null   // HH:MM
  expiryDate: string | null
  expiryTime: string | null
  /** On edit: the stored publication moment (ISO), kept if unchanged. */
  existingPublishIso?: string | null
}

export type ScheduleField = 'publish_date' | 'publish_time' | 'expiry_date' | 'expiry_time'
export type ScheduleResult =
  | { ok: true; publishIso: string; expiryIso: string | null }
  | { ok: false; field: ScheduleField; error: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Sri Lanka's date for a moment, as YYYY-MM-DD. */
export function orgDateOf(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

export function resolveSchedule(input: ScheduleInput, now: Date = new Date()): ScheduleResult {
  let publishIso: string
  if (input.mode === 'now') {
    publishIso = now.toISOString()
  } else {
    const date = input.publishDate?.trim() || ''
    const time = input.publishTime?.trim() || ''
    if (!date) return { ok: false, field: 'publish_date', error: 'Choose a publication date.' }
    if (!DATE.test(date)) return { ok: false, field: 'publish_date', error: 'Enter the publication date as a full date.' }
    if (time && !TIME.test(time)) return { ok: false, field: 'publish_time', error: 'Enter the publication time as hours and minutes, e.g. 14:30.' }
    const today = orgDateOf(now)
    const isToday = date === today
    if (isToday && !time) return { ok: false, field: 'publish_time', error: 'The publication date is today, so choose a time later than now.' }
    publishIso = orgDateTimeToIso(date, time || '00:00')
    // The form shows hours and minutes only, so an untouched time comes back
    // without the stored seconds. Same minute = unchanged: keep the exact
    // stored value (the database then also sees no change).
    const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60000)
    const unchanged = !!input.existingPublishIso && minute(input.existingPublishIso) === minute(publishIso)
    if (unchanged) publishIso = input.existingPublishIso!
    if (!unchanged) {
      if (date < today) return { ok: false, field: 'publish_date', error: "The publication date can't be in the past." }
      if (new Date(publishIso).getTime() <= now.getTime()) {
        return { ok: false, field: 'publish_time', error: 'The publication time must be later than now (Sri Lanka time).' }
      }
    }
  }

  let expiryIso: string | null = null
  const eDate = input.expiryDate?.trim() || ''
  const eTime = input.expiryTime?.trim() || ''
  if (eDate || eTime) {
    if (!eDate) return { ok: false, field: 'expiry_date', error: 'Choose an expiry date, or untick the expiry option.' }
    if (!DATE.test(eDate)) return { ok: false, field: 'expiry_date', error: 'Enter the expiry date as a full date.' }
    if (eTime && !TIME.test(eTime)) return { ok: false, field: 'expiry_time', error: 'Enter the expiry time as hours and minutes, e.g. 17:00.' }
    expiryIso = orgDateTimeToIso(eDate, eTime || '23:59')
    if (new Date(expiryIso).getTime() <= new Date(publishIso).getTime()) {
      return { ok: false, field: eTime ? 'expiry_time' : 'expiry_date', error: 'The expiry date and time must be after the publication date and time.' }
    }
  }

  return { ok: true, publishIso, expiryIso }
}
