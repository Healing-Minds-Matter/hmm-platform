// Sunday-start month/week grid (matches the Figma calendar's SUN–SAT header
// row — the previous hand-rolled version was Monday-start), computed in UTC
// so the grid boundaries and the events queried/bucketed into it always
// agree regardless of server timezone.

export function monthGridRange(year: number, month1to12: number) {
  const firstOfMonth = new Date(Date.UTC(year, month1to12 - 1, 1))
  const lastOfMonth = new Date(Date.UTC(year, month1to12, 0))

  const gridStart = new Date(firstOfMonth)
  gridStart.setUTCDate(firstOfMonth.getUTCDate() - firstOfMonth.getUTCDay())

  const gridEnd = new Date(lastOfMonth)
  gridEnd.setUTCDate(lastOfMonth.getUTCDate() + (6 - lastOfMonth.getUTCDay()))

  return { gridStart, gridEnd, firstOfMonth, lastOfMonth }
}

// Sunday-start week containing `date`.
export function weekRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start, end }
}

export function gridDays(gridStart: Date, gridEnd: Date): Date[] {
  const days: Date[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    days.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// ── Views (sheet row 45 added Year and Quarter) ──────────────────────────────
export type CalendarView = 'year' | 'quarter' | 'month' | 'week' | 'agenda'
export const CALENDAR_VIEWS: CalendarView[] = ['year', 'quarter', 'month', 'week', 'agenda']
export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = { year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week', agenda: 'Agenda' }

export function parseCalendarView(value: string | undefined): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView) ? (value as CalendarView) : 'month'
}

/** 1–4 */
export function quarterOf(month1to12: number): number {
  return Math.ceil(month1to12 / 3)
}

/** First month (1–12) of the quarter containing `month1to12`. */
export function quarterStartMonth(month1to12: number): number {
  return (quarterOf(month1to12) - 1) * 3 + 1
}

/**
 * The days a view covers, as wall-clock dates (start inclusive, end
 * exclusive), for querying events. Null = no date limit (Agenda).
 */
export function viewRange(view: CalendarView, year: number, month1to12: number, day: number): { start: Date; endExclusive: Date } | null {
  const plusOne = (d: Date) => { const n = new Date(d); n.setUTCDate(n.getUTCDate() + 1); return n }
  if (view === 'month') {
    const { gridStart, gridEnd } = monthGridRange(year, month1to12)
    return { start: gridStart, endExclusive: plusOne(gridEnd) }
  }
  if (view === 'week') {
    const { start, end } = weekRange(new Date(Date.UTC(year, month1to12 - 1, day)))
    return { start, endExclusive: plusOne(end) }
  }
  if (view === 'quarter') {
    const m = quarterStartMonth(month1to12)
    return { start: new Date(Date.UTC(year, m - 1, 1)), endExclusive: new Date(Date.UTC(year, m + 2, 1)) }
  }
  if (view === 'year') return { start: new Date(Date.UTC(year, 0, 1)), endExclusive: new Date(Date.UTC(year + 1, 0, 1)) }
  return null
}
