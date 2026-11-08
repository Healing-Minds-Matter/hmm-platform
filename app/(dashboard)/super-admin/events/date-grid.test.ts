import { describe, expect, it } from 'vitest'
import { parseCalendarView, quarterOf, quarterStartMonth, viewRange } from './date-grid'

// Sheet row 45: Year and Quarter views alongside Month/Week/Agenda.
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('calendar views', () => {
  it('parses the view, defaulting to Month', () => {
    expect(parseCalendarView('year')).toBe('year')
    expect(parseCalendarView('quarter')).toBe('quarter')
    expect(parseCalendarView('nonsense')).toBe('month')
    expect(parseCalendarView(undefined)).toBe('month')
  })
  it('knows the quarter of a month', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12].map(quarterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
    expect(quarterStartMonth(11)).toBe(10)
  })
  it('covers the whole year / quarter (end exclusive)', () => {
    const y = viewRange('year', 2026, 11, 6)!
    expect([iso(y.start), iso(y.endExclusive)]).toEqual(['2026-01-01', '2027-01-01'])
    const q = viewRange('quarter', 2026, 11, 6)!
    expect([iso(q.start), iso(q.endExclusive)]).toEqual(['2026-10-01', '2027-01-01'])
    const q1 = viewRange('quarter', 2026, 2, 1)!
    expect([iso(q1.start), iso(q1.endExclusive)]).toEqual(['2026-01-01', '2026-04-01'])
  })
  it('keeps Month and Week ranges as before, and Agenda unlimited', () => {
    const m = viewRange('month', 2026, 11, 6)!
    expect([iso(m.start), iso(m.endExclusive)]).toEqual(['2026-11-01', '2026-12-06'])
    const w = viewRange('week', 2026, 11, 6)!
    expect([iso(w.start), iso(w.endExclusive)]).toEqual(['2026-11-01', '2026-11-08'])
    expect(viewRange('agenda', 2026, 11, 6)).toBeNull()
  })
})
