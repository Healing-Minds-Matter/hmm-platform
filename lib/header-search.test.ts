// Fix O: the header search box did nothing, so it is hidden for Super Admin
// and Champion (one shared layout) until search is built. The markup stays in
// the layout behind SHOW_HEADER_SEARCH so it is easy to bring back.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHOW_HEADER_SEARCH } from './header-search'

const layout = readFileSync('components/dashboard-client-layout.tsx', 'utf8')

describe('header search box (Fix O)', () => {
  it('is switched off', () => {
    expect(SHOW_HEADER_SEARCH).toBe(false)
  })

  it('is only drawn when the switch is on', () => {
    const gate = layout.indexOf('{SHOW_HEADER_SEARCH && (')
    const input = layout.indexOf('placeholder="Search Champions, Gatekeepers, clubs…"')
    expect(gate).toBeGreaterThan(-1)
    expect(input).toBeGreaterThan(gate)
    // Nothing else in the layout draws a search input.
    expect(layout.match(/aria-label="Search"/g)).toHaveLength(1)
  })

  it('keeps Help, the bell and the profile menu on the right without it', () => {
    expect(layout).toMatch(/className="ml-auto flex flex-shrink-0 items-center gap-3"/)
  })
})
