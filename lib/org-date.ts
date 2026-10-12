// HMM runs on Sri Lanka time (Asia/Colombo, UTC+05:30 all year — no daylight
// saving). The live site's server runs on UTC and users' browsers on local
// time, so anything shown or compared as a calendar date or clock time must
// name the time zone explicitly rather than rely on whichever machine runs it.

export const ORG_TIME_ZONE = 'Asia/Colombo'
const ORG_OFFSET = '+05:30'
const ORG_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

// Today's date in Sri Lanka, as YYYY-MM-DD (the form a date input uses).
// Between midnight and 05:30 in Sri Lanka a server-UTC "today" would still
// be yesterday. Used for certification and resource publication dates.
export function todayDateString(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// ── Event date/times ─────────────────────────────────────────────────────────
// Event times are stored as real moments in time (timestamptz). A date and
// time typed into a form mean Sri Lanka time; screens show them in Sri Lanka
// time too.

// Form date (YYYY-MM-DD) + time (HH:MM), meant as Sri Lanka time → ISO string
// for the database.
export function orgDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${ORG_OFFSET}`).toISOString()
}

// A stored moment → the Sri Lanka date and time, in the forms a date input
// (YYYY-MM-DD) and time input (HH:MM) use — e.g. to pre-fill an edit form.
export function isoToOrgDateTime(iso: string): { date: string; time: string } {
  const wall = toOrgWallClock(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
    time: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`,
  }
}

// The calendar works with "wall-clock" Dates: Date objects whose UTC fields
// (getUTCDate, getUTCHours, …) read as the Sri Lanka date/time. That lets
// the existing UTC-based grid maths (date-grid.ts) place events on the
// right Sri Lanka day without depending on the machine's time zone.
export function toOrgWallClock(input: string | Date): Date {
  return new Date(new Date(input).getTime() + ORG_OFFSET_MS)
}

// The inverse: a wall-clock Date (e.g. a calendar grid day at 00:00) → the
// real moment, for database range queries.
export function fromOrgWallClock(wallClock: Date): Date {
  return new Date(wallClock.getTime() - ORG_OFFSET_MS)
}

// Formatting a stored moment in Sri Lanka time. Same options as
// toLocaleDateString / toLocaleTimeString.
export function formatOrgDate(input: string | Date, options: Intl.DateTimeFormatOptions, locale = 'en-AU'): string {
  return new Date(input).toLocaleDateString(locale, { ...options, timeZone: ORG_TIME_ZONE })
}

export function formatOrgTime(input: string | Date, options: Intl.DateTimeFormatOptions, locale = 'en-AU'): string {
  return new Date(input).toLocaleTimeString(locale, { ...options, timeZone: ORG_TIME_ZONE })
}
