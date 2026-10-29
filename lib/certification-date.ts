// A Gatekeeper's QPR certification date is when they were certified, so it
// can't be in the future. It's optional: members who aren't certified yet
// can still be added (and use the app); leave it blank until they are. Shared by the forms (to cap the date picker) and
// the server actions (the real check — single create, CSV upload and edit).
//
// "Today" is Sri Lanka's date, not the server's: the live site runs on UTC,
// so between midnight and 05:30 in Sri Lanka a server-UTC "today" would
// still be yesterday and wrongly reject a certification dated today.

import { todayDateString } from '@/lib/org-date'

export { todayDateString }

export const FUTURE_DATE_MESSAGE = 'Certification date cannot be in the future.'

// Returns a user-facing error, or null when the date is acceptable (or
// blank — not certified yet).
export function validateCertificationDate(value: string | null | undefined): string | null {
  const date = (value ?? '').trim()
  if (!date) return null

  // Also guards the expiry calculation, which can't handle e.g. "01/10/2026".
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const parsed = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null
  if (!parsed || parsed.getUTCDate() !== +match![3] || parsed.getUTCMonth() !== +match![2] - 1) {
    return 'Certification date must be a valid date in YYYY-MM-DD format.'
  }

  if (date > todayDateString()) return FUTURE_DATE_MESSAGE
  return null
}

// Props for a form's certification-date <input>: caps the picker at today,
// and replaces the browser's own "Value must be … or earlier" bubble with the
// same message the server returns, so the wording is identical everywhere.
// The message is cleared as soon as the date is changed.
export function certificationDateInputProps() {
  return {
    max: todayDateString(),
    onInvalid: (event: { currentTarget: HTMLInputElement }) => {
      const input = event.currentTarget
      if (input.validity.rangeOverflow) input.setCustomValidity(FUTURE_DATE_MESSAGE)
    },
    onInput: (event: { currentTarget: HTMLInputElement }) => {
      event.currentTarget.setCustomValidity('')
    },
  }
}
