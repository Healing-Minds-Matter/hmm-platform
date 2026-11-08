import { describe, expect, it } from 'vitest'
import { orgDateOf, resolveSchedule } from '@/lib/announcement-schedule'

// Sheet rows 71 and 72, in Sri Lanka time (UTC+05:30).
// "Now" = 2026-11-06 10:00 in Sri Lanka = 04:30 UTC.
const NOW = new Date('2026-11-06T04:30:00Z')
const base = { mode: 'later' as const, publishDate: null, publishTime: null, expiryDate: null, expiryTime: null }

describe('publication time (row 71)', () => {
  it('"Publish now" goes live at the moment of saving', () => {
    expect(resolveSchedule({ ...base, mode: 'now' }, NOW)).toEqual({ ok: true, publishIso: NOW.toISOString(), expiryIso: null })
  })
  it('requires a time when the date is today', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06' }, NOW))
      .toEqual({ ok: false, field: 'publish_time', error: 'The publication date is today, so choose a time later than now.' })
  })
  it('refuses a time today that is not later than now (Sri Lanka time)', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '09:59' }, NOW))
      .toMatchObject({ ok: false, field: 'publish_time' })
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '10:00' }, NOW))
      .toMatchObject({ ok: false, field: 'publish_time' })
  })
  it('accepts a later time today, stored in UTC', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '10:01' }, NOW))
      .toEqual({ ok: true, publishIso: '2026-11-06T04:31:00.000Z', expiryIso: null })
  })
  it('uses Sri Lanka "today", not the server\'s UTC date', () => {
    // 01:00 in Sri Lanka on 7 Nov is still 6 Nov in UTC.
    const earlySL = new Date('2026-11-06T19:30:00Z')
    expect(orgDateOf(earlySL)).toBe('2026-11-07')
    expect(resolveSchedule({ ...base, publishDate: '2026-11-07' }, earlySL)).toMatchObject({ ok: false, field: 'publish_time' })
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '23:00' }, earlySL)).toMatchObject({ ok: false, field: 'publish_date' })
  })
  it('a later date needs no time (start of that day in Sri Lanka)', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-08' }, NOW))
      .toEqual({ ok: true, publishIso: '2026-11-07T18:30:00.000Z', expiryIso: null })
  })
  it('refuses a past date, but keeps an unchanged one on edit', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-01', publishTime: '09:00' }, NOW)).toMatchObject({ ok: false, field: 'publish_date' })
    expect(resolveSchedule({ ...base, publishDate: '2026-11-01', publishTime: '09:00', existingPublishIso: '2026-11-01T03:30:00Z' }, NOW))
      .toEqual({ ok: true, publishIso: '2026-11-01T03:30:00Z', expiryIso: null })
  })
})

describe('expiry (row 72)', () => {
  it('must be after the publication date and time', () => {
    expect(resolveSchedule({ ...base, publishDate: '2026-11-08', publishTime: '12:00', expiryDate: '2026-11-08', expiryTime: '11:00' }, NOW))
      .toEqual({ ok: false, field: 'expiry_time', error: 'The expiry date and time must be after the publication date and time.' })
    expect(resolveSchedule({ ...base, publishDate: '2026-11-08', publishTime: '12:00', expiryDate: '2026-11-08', expiryTime: '12:00' }, NOW))
      .toMatchObject({ ok: false })
    expect(resolveSchedule({ ...base, publishDate: '2026-11-09', expiryDate: '2026-11-08' }, NOW))
      .toMatchObject({ ok: false, field: 'expiry_date' })
  })
  it('defaults to the end of the expiry day (Sri Lanka)', () => {
    expect(resolveSchedule({ ...base, mode: 'now', expiryDate: '2026-11-06' }, NOW))
      .toEqual({ ok: true, publishIso: NOW.toISOString(), expiryIso: '2026-11-06T18:29:00.000Z' })
  })
  it('a time without a date is refused', () => {
    expect(resolveSchedule({ ...base, mode: 'now', expiryTime: '10:00' }, NOW)).toMatchObject({ ok: false, field: 'expiry_date' })
  })
})

// Found in browser testing: editing a "Publish now" announcement without
// touching the time was refused, because the form drops the stored seconds.
describe('editing keeps an untouched publication time', () => {
  it('same minute as the stored time = unchanged, and the exact stored value is kept', () => {
    const stored = '2026-11-06T04:25:37.123456+00:00' // 09:55:37 in Sri Lanka, "Publish now"
    const r = resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '09:55', existingPublishIso: stored }, new Date('2026-11-06T06:00:00Z'))
    expect(r).toEqual({ ok: true, publishIso: stored, expiryIso: null })
  })
  it('a different minute in the past is still refused', () => {
    const stored = '2026-11-06T04:25:37Z'
    expect(resolveSchedule({ ...base, publishDate: '2026-11-06', publishTime: '09:54', existingPublishIso: stored }, new Date('2026-11-06T06:00:00Z')))
      .toMatchObject({ ok: false, field: 'publish_time' })
  })
})
