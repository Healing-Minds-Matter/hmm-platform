// @vitest-environment jsdom
import { createElement as h } from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
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

  it('keeps a box\'s own classes (Fix Q2), on top of the phone rules', () => {
    render(h(ScrollTable, { label: 'Registrations', className: 'max-h-56 overflow-y-auto', children: table() }))
    const classes = screen.getByRole('region', { name: 'Registrations table' }).className.split(' ')
    expect(classes).toContain('max-h-56')
    expect(classes).toContain('overflow-y-auto')
    expect(classes).toContain('max-lg:overflow-x-auto')
  })
})

// Fix Q2: every table on a Super Admin page sits inside <ScrollTable>.
// Shared tables that Champion pages also use are checked in the Q3 block below.
const SUPER_ADMIN_TABLE_FILES = [
  'app/(dashboard)/super-admin/certifications/audit/page.tsx',
  'app/(dashboard)/super-admin/champions/page.tsx',
  'app/(dashboard)/super-admin/champions/[id]/page.tsx',
  'app/(dashboard)/super-admin/clubs/page.tsx',
  'app/(dashboard)/super-admin/clubs/[id]/page.tsx',
  'app/(dashboard)/super-admin/events/event-detail-panel.tsx',
  'app/(dashboard)/super-admin/gatekeepers/page.tsx',
  'app/(dashboard)/super-admin/permissions/audit/page.tsx',
  'app/(dashboard)/super-admin/permissions/delegations/page.tsx',
  'app/(dashboard)/super-admin/permissions/effective/effective-permissions-table.tsx',
  'app/(dashboard)/super-admin/permissions/exceptions/page.tsx',
  'app/(dashboard)/super-admin/permissions/groups/page.tsx',
  'app/(dashboard)/super-admin/permissions/groups/[id]/page.tsx',
  'app/(dashboard)/super-admin/resources/categories/page.tsx',
  'components/certifications/design-versions.tsx',
  'components/dashboard/bar-chart-widget.tsx',
  'components/dashboard/onboarding-widget.tsx',
  'components/dashboard/stacked-bar-widget.tsx',
]
const SHARED_WITH_CHAMPION = [
  'components/certifications/types-table.tsx',
  'components/certifications/certification-figures-card.tsx',
  'components/certifications/certificates-panel.tsx',
]

/** How many <table>s in this source are not inside an open <ScrollTable>. */
function unwrappedTables(src: string): number {
  let depth = 0
  let missing = 0
  for (const m of src.matchAll(/<ScrollTable[\s>]|<\/ScrollTable>|<table[\s>]/g)) {
    if (m[0].startsWith('</')) depth--
    else if (m[0].startsWith('<ScrollTable')) depth++
    else if (depth === 0) missing++
  }
  return missing
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.tsx'))
    .map(f => join(dir, f).split(sep).join('/'))
}

describe('Super Admin tables on phones (Fix Q2)', () => {
  it.each(SUPER_ADMIN_TABLE_FILES)('%s: every table is inside ScrollTable', file => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/<table[\s>]/)
    expect(unwrappedTables(src)).toBe(0)
  })

  it('the list above covers every Super Admin file with a table', () => {
    const withTables = filesUnder('app/(dashboard)/super-admin').filter(f => /<table[\s>]/.test(readFileSync(f, 'utf8')))
    expect(withTables.sort()).toEqual(SUPER_ADMIN_TABLE_FILES.filter(f => f.startsWith('app/')).sort())
  })

  it('shared certification tables still scroll sideways in their own box', () => {
    for (const file of SHARED_WITH_CHAMPION) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/overflow-x-auto[^"]*">\s*<table className="w-full min-w-\[\d+px\]/)
    }
  })

  it('spots a table left outside the wrapper', () => {
    expect(unwrappedTables('<ScrollTable label="A"><table></table></ScrollTable><table></table>')).toBe(1)
    expect(unwrappedTables('<div><table className="w-full"></table></div>')).toBe(1)
  })
})

// Fix Q3: Champion pages. The Gatekeepers list is the only table in the
// Champion folder; the 3 certification tables are shared components.
const CHAMPION_TABLE_FILES = ['app/(dashboard)/champion/gatekeepers/page.tsx']

describe('Champion tables and pages on phones (Fix Q3)', () => {
  it.each([...CHAMPION_TABLE_FILES, ...SHARED_WITH_CHAMPION])('%s: every table is inside ScrollTable', file => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/<table[\s>]/)
    expect(unwrappedTables(src)).toBe(0)
  })

  it('the list above covers every Champion file with a table', () => {
    const withTables = filesUnder('app/(dashboard)/champion').filter(f => /<table[\s>]/.test(readFileSync(f, 'utf8')))
    expect(withTables.sort()).toEqual([...CHAMPION_TABLE_FILES].sort())
  })

  it('no Champion page keeps its wide desktop edges (p-6 / p-8) on a phone', () => {
    const wide: string[] = []
    for (const file of filesUnder('app/(dashboard)/champion')) {
      for (const m of readFileSync(file, 'utf8').matchAll(/className="([^"]*)"/g)) {
        if (/(^|\s)p-(6|8)(\s|$)/.test(m[1]) && !/max-sm:p-4/.test(m[1])) wide.push(`${file}: ${m[1]}`)
      }
    }
    expect(wide).toEqual([])
  })
})
