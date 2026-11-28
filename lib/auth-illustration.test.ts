import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  ILLUSTRATION_IMAGES,
  ILLUSTRATION_MEDIA_QUERY,
  isIllustrationScreen,
  subscribeToIllustrationScreen,
} from './auth-illustration'

const root = join(__dirname, '..')
const panelSource = readFileSync(join(root, 'components/auth/auth-illustration-panel.tsx'), 'utf8')

function fakeWindow(matches: boolean) {
  const query = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const win = { matchMedia: vi.fn(() => query as unknown as MediaQueryList) }
  return { win, query }
}

describe('isIllustrationScreen', () => {
  it('is false on the server (no window), so phones never get the images in the HTML', () => {
    expect(isIllustrationScreen(undefined)).toBe(false)
  })

  it('is false on a narrow screen', () => {
    const { win } = fakeWindow(false)
    expect(isIllustrationScreen(win)).toBe(false)
    expect(win.matchMedia).toHaveBeenCalledWith(ILLUSTRATION_MEDIA_QUERY)
  })

  it('is true on a wide screen', () => {
    expect(isIllustrationScreen(fakeWindow(true).win)).toBe(true)
  })

  it('is false when matchMedia is missing', () => {
    expect(isIllustrationScreen({} as Pick<Window, 'matchMedia'>)).toBe(false)
  })
})

describe('subscribeToIllustrationScreen', () => {
  it('listens for breakpoint changes and stops on unsubscribe', () => {
    const { win, query } = fakeWindow(false)
    const onChange = vi.fn()
    const unsubscribe = subscribeToIllustrationScreen(onChange, win)
    expect(query.addEventListener).toHaveBeenCalledWith('change', onChange)
    unsubscribe()
    expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange)
  })

  it('is a safe no-op without a window', () => {
    expect(() => subscribeToIllustrationScreen(() => {}, undefined)()).not.toThrow()
  })
})

describe('breakpoint matches the panel', () => {
  it('uses the same width as Tailwind lg, which the panel uses to show itself', () => {
    expect(ILLUSTRATION_MEDIA_QUERY).toBe('(min-width: 1024px)')
    expect(panelSource).toContain('lg:flex')
  })
})

describe('illustration images', () => {
  const files = Object.values(ILLUSTRATION_IMAGES).map((p) => join(root, 'public', p))

  it('all exist', () => {
    for (const f of files) expect(existsSync(f), f).toBe(true)
  })

  it('stay small (under 200 KB together; was ~880 KB)', () => {
    const total = files.reduce((sum, f) => sum + statSync(f).size, 0)
    expect(total).toBeLessThan(200 * 1024)
  })

  it('are only drawn behind the wide-screen check, never with hard-coded paths', () => {
    expect(panelSource).not.toMatch(/href="\/images\/login\//)
    const imageTags = panelSource.match(/<image\s/g) ?? []
    const guarded = panelSource.match(/showImages && \(?\s*<image\s/g) ?? []
    expect(imageTags.length).toBe(3)
    expect(guarded.length).toBe(imageTags.length)
  })

  it('starts hidden on the server render (server snapshot is false)', () => {
    expect(panelSource).toMatch(/useSyncExternalStore\([\s\S]*?\(\) => false,?\s*\)/)
  })
})
