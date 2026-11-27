// @vitest-environment jsdom
import { createElement as h } from 'react'
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SCROLL_TABLE_CLASSES, ScrollTable } from './scroll-table'

afterEach(() => cleanup())

const table = () =>
  h('table', null,
    h('thead', null, h('tr', null, h('th', null, 'Club'), h('th', null, 'Status'))),
    h('tbody', null, h('tr', null, h('td', null, 'ZZ Club'), h('td', null, 'Active'))),
  )

describe('ScrollTable (wide tables on phones)', () => {
  it('wraps the table in a named, keyboard-reachable scroll area', () => {
    render(h(ScrollTable, { label: 'Clubs', children: table() }))
    const region = screen.getByRole('region', { name: 'Clubs table' })
    expect(region.tabIndex).toBe(0)
    expect(region.querySelector('table')).not.toBeNull()
  })

  it('uses 880px as the default narrowest width, or the one given', () => {
    render(h(ScrollTable, { label: 'A', children: table() }))
    render(h(ScrollTable, { label: 'B', minWidth: 760, children: table() }))
    expect(screen.getByRole('region', { name: 'A table' }).style.getPropertyValue('--scroll-table-min')).toBe('880px')
    expect(screen.getByRole('region', { name: 'B table' }).style.getPropertyValue('--scroll-table-min')).toBe('760px')
  })

  it('scrolls sideways and pins the first column, on phones/tablets only', () => {
    const classes = SCROLL_TABLE_CLASSES.split(' ')
    expect(classes).toContain('max-lg:overflow-x-auto')
    expect(classes).toContain('max-lg:[&>table]:min-w-[var(--scroll-table-min)]')
    expect(classes).toContain('max-lg:[&_tr>*:first-child]:sticky')
    expect(classes).toContain('max-lg:[&_tr>*:first-child]:left-0')
    // Pinned cells need a solid background, or scrolled cells show through.
    expect(classes).toContain('max-lg:[&_tbody_tr>*:first-child]:bg-white')
    expect(classes).toContain('max-lg:[&_thead_tr>*:first-child]:bg-[#F9F9F9]')
  })

  it('changes nothing on desktop: every layout rule is limited to below 1024px', () => {
    const layout = SCROLL_TABLE_CLASSES.split(' ').filter(c => !c.startsWith('focus'))
    for (const c of layout) expect(c.startsWith('max-lg:'), c).toBe(true)
  })

  it('is used on the Super Admin Clubs table (the Q1 example)', () => {
    const src = readFileSync('app/(dashboard)/super-admin/clubs/page.tsx', 'utf8')
    expect(src).toMatch(/<ScrollTable label="Clubs"[^>]*>\s*<table/)
  })
})
