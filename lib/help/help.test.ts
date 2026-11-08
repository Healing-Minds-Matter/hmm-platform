import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUPER_ADMIN_MANUAL } from '@/lib/help/manual-super-admin'
import { CHAMPION_MANUAL } from '@/lib/help/manual-champion'
import { helpHrefFor, helpSectionFor, searchManual } from '@/lib/help/topics'
import { supportEmail } from '@/lib/help/support'

// Sheet row 55: the Help icon opens the user manual for the current page.
const manuals = [SUPER_ADMIN_MANUAL, CHAMPION_MANUAL]

describe('manual content', () => {
  it.each(manuals)('$title: section and article ids are unique and every article has content', m => {
    const sectionIds = m.sections.map(s => s.id)
    expect(new Set(sectionIds).size).toBe(sectionIds.length)
    for (const s of m.sections) {
      const ids = s.articles.map(a => a.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const a of s.articles) expect((a.steps?.length ?? 0) + (a.notes?.length ?? 0) + (a.intro ? 1 : 0)).toBeGreaterThan(0)
    }
  })

  it('covers every sidebar area of each portal', () => {
    for (const p of ['/super-admin', '/super-admin/clubs', '/super-admin/champions', '/super-admin/gatekeepers', '/super-admin/certifications',
      '/super-admin/resources', '/super-admin/announcements', '/super-admin/events', '/super-admin/permissions']) {
      expect(helpSectionFor(SUPER_ADMIN_MANUAL, p), p).not.toBeNull()
    }
    for (const p of ['/champion', '/champion/gatekeepers', '/champion/certifications', '/champion/events', '/champion/announcements', '/champion/resources']) {
      expect(helpSectionFor(CHAMPION_MANUAL, p), p).not.toBeNull()
    }
  })

  it('never names a certification type', () => {
    expect(JSON.stringify(manuals)).not.toMatch(/\bqpr\b/i)
  })
})

describe('contextual help', () => {
  it('opens the section for the current page (the most specific match)', () => {
    expect(helpHrefFor(SUPER_ADMIN_MANUAL, '/super-admin/events')).toBe('/super-admin/help#events')
    expect(helpHrefFor(SUPER_ADMIN_MANUAL, '/super-admin/resources/categories')).toBe('/super-admin/help#resources')
    expect(helpHrefFor(SUPER_ADMIN_MANUAL, '/super-admin')).toBe('/super-admin/help#dashboard')
    expect(helpHrefFor(CHAMPION_MANUAL, '/champion/gatekeepers/abc')).toBe('/champion/help#gatekeepers')
    expect(helpHrefFor(CHAMPION_MANUAL, '/champion/profile')).toBe('/champion/help#getting-started')
  })
  it("doesn't match a path that only starts with the same letters", () => {
    expect(helpSectionFor(SUPER_ADMIN_MANUAL, '/super-administrator')).toBeNull()
  })
})

describe('search', () => {
  it('finds articles by any of their words, all words required', () => {
    const r = searchManual(SUPER_ADMIN_MANUAL, 'password')
    expect(r.flatMap(s => s.articles.map(a => a.id))).toContain('profile')
    expect(searchManual(SUPER_ADMIN_MANUAL, 'category deactivate').flatMap(s => s.articles.map(a => a.id))).toEqual(['categories'])
  })
  it('keeps a whole section when its title matches, and returns nothing for nonsense', () => {
    expect(searchManual(CHAMPION_MANUAL, 'events').find(s => s.id === 'events')!.articles.length).toBe(CHAMPION_MANUAL.sections.find(s => s.id === 'events')!.articles.length)
    expect(searchManual(CHAMPION_MANUAL, 'zzzqqq')).toEqual([])
    expect(searchManual(CHAMPION_MANUAL, '   ')).toBe(CHAMPION_MANUAL.sections)
  })
})

describe('support contact', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  it('uses NEXT_PUBLIC_SUPPORT_EMAIL when it is a valid address', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', ' support@example.com ')
    expect(supportEmail()).toBe('support@example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'not an email')
    expect(supportEmail()).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', '')
    expect(supportEmail()).toBeNull()
  })
})
