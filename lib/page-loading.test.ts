// Fix T: a loading state shows straight away between Super Admin / Champion
// pages, and pop-up (@modal) routes never get the full-page loader.
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageLoading } from '@/components/page-loading'
import SuperAdminLoading from '@/app/(dashboard)/super-admin/loading'
import ChampionLoading from '@/app/(dashboard)/champion/loading'

const DASHBOARD = path.join(process.cwd(), 'app', '(dashboard)')
const AREAS = ['super-admin', 'champion']

function subfolders(dir: string): string[] {
  return readdirSync(dir).filter(n => statSync(path.join(dir, n)).isDirectory())
}

// Every folder below `dir` (not `dir` itself).
function allFoldersUnder(dir: string): string[] {
  return subfolders(dir).flatMap(n => {
    const full = path.join(dir, n)
    return [full, ...allFoldersUnder(full)]
  })
}

describe('PageLoading', () => {
  const html = renderToStaticMarkup(createElement(PageLoading))

  it('is announced to screen readers as a busy status', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toMatch(/<span class="sr-only">Loading page…<\/span>/)
  })

  it('hides the grey placeholder blocks from screen readers', () => {
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2)
  })

  it('only pulses when the user allows motion', () => {
    expect(html).toContain('motion-safe:animate-pulse')
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/)
  })

  it('uses the same padding as the dashboard pages, so nothing jumps', () => {
    expect(html).toContain('p-8')
  })
})

describe('loading.tsx placement', () => {
  it.each(AREAS)('%s has a loading.tsx that renders PageLoading', area => {
    expect(existsSync(path.join(DASHBOARD, area, 'loading.tsx'))).toBe(true)
    const Loading = area === 'super-admin' ? SuperAdminLoading : ChampionLoading
    expect(renderToStaticMarkup(createElement(Loading))).toBe(
      renderToStaticMarkup(createElement(PageLoading)),
    )
  })

  it('no loading.tsx inside an @modal slot or a folder that holds one (pop-ups would flash the full-page loader)', () => {
    const offenders = AREAS.flatMap(area => allFoldersUnder(path.join(DASHBOARD, area)))
      .filter(dir => {
        const inModal = dir.split(path.sep).some(p => p.startsWith('@'))
        const holdsModal = subfolders(dir).some(n => n.startsWith('@'))
        return (inModal || holdsModal) && existsSync(path.join(dir, 'loading.tsx'))
      })
      .map(dir => path.relative(DASHBOARD, dir))
    expect(offenders).toEqual([])
  })

  it('the areas themselves have no @modal slot (so their loading.tsx never wraps a pop-up)', () => {
    for (const area of AREAS) {
      expect(subfolders(path.join(DASHBOARD, area)).filter(n => n.startsWith('@'))).toEqual([])
    }
  })
})
