import { describe, expect, it } from 'vitest'
import {
  buildJourney,
  canRenew,
  checkAttachment,
  describeChanges,
  expiryFor,
  validateAward,
  validateRemoval,
  type CertificateRow,
} from '@/lib/certificates'

const TODAY = '2026-11-03'
const qpr = { name: 'QPR', status: 'active' as const, offered_from: '2021-12-15' }

function cert(over: Partial<CertificateRow>): CertificateRow {
  return {
    id: 'c1', holder_id: 'h', type_id: 't', achieved_on: '2025-06-01', expires_on: '2028-06-01', validity_value: 3, validity_unit: 'years',
    format: 'physical', attachment_path: null, certificate_number: null, design_version: null, migrated: false, added_by: null,
    created_at: '2025-06-01T10:00:00Z', removed_at: null, removed_by: null, removed_reason_category: null, removed_reason: null,
    is_current: true, stopped_on: null, status: 'valid', ...over,
  }
}

describe('expiryFor (same as the database)', () => {
  it('adds years or months, and keeps month ends real', () => {
    expect(expiryFor('2026-03-12', 3, 'years')).toBe('2029-03-12')
    expect(expiryFor('2026-01-31', 1, 'months')).toBe('2026-02-28')
    expect(expiryFor('2024-02-29', 1, 'years')).toBe('2025-02-28')
    expect(expiryFor('2026-03-12', null, null)).toBeNull()
  })
})

describe('validateAward', () => {
  it('accepts a valid award', () => {
    expect(validateAward({ achievedOn: '2026-03-12', format: 'both' }, qpr, TODAY)).toBeNull()
  })
  it('refuses a retired type, a missing, future or too-early date, and an unknown format', () => {
    expect(validateAward({ achievedOn: '2026-03-12', format: 'physical' }, { ...qpr, status: 'retired' }, TODAY)).toBe('QPR is retired and can’t be awarded.')
    expect(validateAward({ achievedOn: '', format: 'physical' }, qpr, TODAY)).toBe('Enter the date achieved.')
    expect(validateAward({ achievedOn: '2026-11-04', format: 'physical' }, qpr, TODAY)).toBe('The date achieved can’t be in the future.')
    expect(validateAward({ achievedOn: '2021-01-01', format: 'physical' }, qpr, TODAY)).toBe('QPR was only offered from 15 Dec 2021.')
    expect(validateAward({ achievedOn: '2026-03-12', format: 'paper' }, qpr, TODAY)).toBe('Choose a certificate format.')
    expect(validateAward({ achievedOn: '2026-03-12', format: 'physical' }, null, TODAY)).toBe('Choose a certification type.')
  })
  it('a renewal must come after the previous certificate', () => {
    expect(validateAward({ achievedOn: '2023-03-10', format: 'physical' }, qpr, TODAY, '2023-03-10')).toBe('The renewal must be after the previous certificate (10 Mar 2023).')
    expect(validateAward({ achievedOn: '2026-10-28', format: 'physical' }, qpr, TODAY, '2023-03-10')).toBeNull()
  })
})

describe('validateRemoval and attachments', () => {
  it('needs a listed reason and at least 10 characters of explanation', () => {
    expect(validateRemoval('Because', 'long enough reason')).toBe('Choose a reason.')
    expect(validateRemoval('Duplicate record', 'short')).toMatch(/at least 10 characters/)
    expect(validateRemoval('Duplicate record', 'Entered twice by mistake.')).toBeNull()
  })
  it('accepts PDF, JPG or PNG up to 10 MB; no file is fine', () => {
    expect(checkAttachment({ name: 'scan.PDF', size: 1000, type: 'application/pdf' })).toEqual({ ext: 'pdf' })
    expect(checkAttachment({ name: 'photo.jpeg', size: 1000, type: 'image/jpeg' })).toEqual({ ext: 'jpg' })
    expect(checkAttachment({ name: 'doc.docx', size: 1000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toEqual({ error: 'The attachment must be a PDF, JPG or PNG.' })
    expect(checkAttachment({ name: 'big.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' })).toEqual({ error: 'The attachment must be 10 MB or less.' })
    expect(checkAttachment({ name: '', size: 0, type: '' })).toBeNull()
    expect(checkAttachment(null)).toBeNull()
  })
})

describe('canRenew', () => {
  it('only current, expired or stopped, active type', () => {
    expect(canRenew(cert({ status: 'expired' }), 'active')).toBe(true)
    expect(canRenew(cert({ status: 'stopped' }), 'active')).toBe(true)
    expect(canRenew(cert({ status: 'expired' }), 'retired')).toBe(false)
    expect(canRenew(cert({ status: 'expiring_soon' }), 'active')).toBe(false)
    expect(canRenew(cert({ status: 'expired', is_current: false }), 'active')).toBe(false)
    expect(canRenew(cert({ status: 'removed', removed_at: '2026-11-01T00:00:00Z' }), 'active')).toBe(false)
  })
})

describe('buildJourney', () => {
  it('lists certificates, expiries before renewal, events and retirements, newest first', () => {
    const old = cert({ id: 'old', achieved_on: '2022-03-10', expires_on: '2025-03-10', status: 'renewed', is_current: false })
    const cur = cert({ id: 'cur', achieved_on: '2026-03-12', expires_on: '2029-03-12' })
    const j = buildJourney([old, cur], [{ id: 'e1', certificate_id: 'cur', kind: 'edited', actor_label: 'A (Champion)', reason: 'typo', changes: null, created_at: '2026-04-01T08:00:00Z' }], [], TODAY)
    expect(j.map(e => `${e.date} ${e.kind}`)).toEqual(['2026-04-01 event', '2026-03-12 certificate', '2025-03-10 expired', '2022-03-10 certificate'])
  })
  it('same-day events are newest first', () => {
    const c = cert({ id: 'c', achieved_on: '2026-10-27' })
    const ev = (id: string, kind: 'edited' | 'removed' | 'restored', at: string) => ({ id, certificate_id: 'c', kind, actor_label: 'A', reason: null, changes: null, created_at: at })
    const j = buildJourney([c], [ev('1', 'edited', '2026-11-03T05:00:00Z'), ev('2', 'removed', '2026-11-03T06:00:00Z'), ev('3', 'restored', '2026-11-03T07:00:00Z')], [], TODAY)
    expect(j.filter(e => e.kind === 'event').map(e => (e.kind === 'event' ? e.event.kind : ''))).toEqual(['restored', 'removed', 'edited'])
  })
  it('no expiry entry when renewed before it expired', () => {
    const old = cert({ id: 'old', achieved_on: '2023-03-10', expires_on: '2026-03-10', status: 'renewed', is_current: false })
    const cur = cert({ id: 'cur', achieved_on: '2026-02-01', expires_on: '2029-02-01' })
    expect(buildJourney([old, cur], [], [], TODAY).some(e => e.kind === 'expired')).toBe(false)
  })
  it('a retirement shows only if it took effect and the person held the type before it', () => {
    const c = cert({ achieved_on: '2025-01-01', type_id: 'stk' })
    const stop = { id: 'r1', type_id: 'stk', retire_on: '2025-12-31', option: 'stop' as const, reactivated_on: '2026-06-01' }
    const sameDay = { id: 'r2', type_id: 'stk', retire_on: '2026-07-01', option: 'stop' as const, reactivated_on: '2026-07-01' }
    expect(buildJourney([c], [], [stop, sameDay], TODAY).map(e => e.kind)).toEqual(['reactivated', 'retired', 'certificate'])
  })
})

describe('describeChanges', () => {
  it('turns recorded changes into words', () => {
    expect(describeChanges({ achieved_on: ['2026-03-12', '2026-03-10'], format: ['physical', 'both'], attachment: true }))
      .toBe('date achieved 12 Mar 2026 → 10 Mar 2026; format Physical → Both; attachment replaced')
    expect(describeChanges(null)).toBe('')
  })
})
