// Fix N (2026-11-27): white text on amber (#F4AC1E) buttons was 1.95:1 contrast,
// below the 4.5:1 minimum. Every amber button now uses the shared `text-on-amber`
// colour (navy #022C51, 7.3:1), defined once in app/globals.css.
// Follow-up (after PR #33): the Reset / Set Your Password form uses a second amber
// (#F5A623, hover #E8941A); its button and rule ticks now use `text-on-amber` too.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const NAVY = '#022C51'
const AMBERS = ['#F4AC1E', '#F5A623']
const HOVER_AMBERS = ['#E09B0F', '#E0991A', '#DB9A15', '#E8941A']
const ROOTS = ['app', 'components', 'lib']
// Icon files shown inside amber buttons: they must be navy, not white.
const ON_AMBER_ICONS = [
  'plus-small', 'plus', 'check', 'publish-send', 'pw-update-btn-lock',
  'c2-save-icon', 'publish-upload-icon', 'pencil-on-amber',
]

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

// Lines whose own (non-hover) background is amber.
function amberLines() {
  return ROOTS.flatMap(sourceFiles).flatMap(path =>
    readFileSync(path, 'utf8').split('\n')
      .map((text, i) => ({ path, line: i + 1, text }))
      .filter(l => AMBERS.some(a => new RegExp(`(^|[\\s"'\`])bg-\\[${a}\\]`, 'i').test(l.text))),
  )
}

describe('amber buttons use navy text', () => {
  it('defines the shared on-amber colour as navy #022C51', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/--color-on-amber:\s*#022C51;/i)
  })

  it('navy passes 4.5:1 on amber in its normal and hover shades', () => {
    for (const bg of [...AMBERS, ...HOVER_AMBERS]) {
      expect(contrast(NAVY, bg)).toBeGreaterThanOrEqual(4.5)
    }
    // and white really did fail, so the test would have caught the old styling
    for (const bg of AMBERS) expect(contrast('#FFFFFF', bg)).toBeLessThan(4.5)
  })

  it('finds the amber buttons to check', () => {
    expect(amberLines().filter(l => l.text.includes('text-on-amber')).length).toBeGreaterThanOrEqual(50)
  })

  it('no amber element sets white text or a white icon', () => {
    const offending = amberLines()
      .filter(l => /(^|[\s"'`:])text-white(?=[\s"'`]|$)|stroke="white"|fill="white"/.test(l.text))
      .map(l => `${l.path}:${l.line}`)
    expect(offending).toEqual([])
  })

  it('every text colour set on an amber element passes 4.5:1', () => {
    const offending = amberLines().flatMap(l => {
      const colours = [...l.text.matchAll(/(?:^|[\s"'`])text-\[(#[0-9A-Fa-f]{6})\]/g)].map(m => m[1])
      return colours.filter(c => AMBERS.some(a => contrast(c, a) < 4.5)).map(c => `${l.path}:${l.line} ${c}`)
    })
    expect(offending).toEqual([])
  })

  it('Reset / Set Your Password: the button and the rule ticks are navy on amber', () => {
    const lines = readFileSync('app/(auth)/reset-password/reset-password-form.tsx', 'utf8')
      .split('\n')
      .filter(l => /(^|[\s"'`])bg-\[#F5A623\]/.test(l) && /(^|[\s"'`])text-/.test(l))
    // the rule tick and the submit button (the strength-bar segments hold no text)
    expect(lines.length).toBe(2)
    for (const l of lines) {
      expect(l).toContain('text-on-amber')
      expect(l).not.toMatch(/(^|[\s"'`:])text-white(?=[\s"'`]|$)/)
    }
  })

  it('icons shown on amber buttons are navy, not white', () => {
    for (const name of ON_AMBER_ICONS) {
      const svg = readFileSync(`public/icons/${name}.svg`, 'utf8')
      expect(svg, name).not.toMatch(/(fill|stroke)="(white|#fff|#ffffff)"/i)
      expect(svg, name).toMatch(/#022C51/i)
    }
  })
})
