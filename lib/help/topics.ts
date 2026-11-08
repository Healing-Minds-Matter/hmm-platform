// Contextual help and search for the user manual (sheet row 55).
import type { HelpArticle, HelpManual, HelpSection } from '@/lib/help/types'

export const HELP_PATH = { super_admin: '/super-admin/help', champion: '/champion/help' } as const

/** The section that covers the page at `pathname` (longest matching path wins). */
export function helpSectionFor(manual: HelpManual, pathname: string): HelpSection | null {
  let best: { section: HelpSection; length: number } | null = null
  for (const section of manual.sections) {
    for (const p of section.paths) {
      const matches = pathname === p || pathname.startsWith(`${p}/`)
      if (matches && (!best || p.length > best.length)) best = { section, length: p.length }
    }
  }
  return best?.section ?? null
}

/** Where the header's ? icon goes from `pathname`: the manual, opened at that page's section. */
export function helpHrefFor(manual: HelpManual, pathname: string): string {
  const section = helpSectionFor(manual, pathname)
  return section ? `${HELP_PATH[manual.portal]}#${section.id}` : HELP_PATH[manual.portal]
}

function articleText(a: HelpArticle): string {
  return [a.title, a.intro ?? '', ...(a.steps ?? []), ...(a.notes ?? [])].join(' ').toLowerCase()
}

/**
 * Sections and articles matching every word of `query` (case-insensitive).
 * A section whose title matches keeps all its articles.
 */
export function searchManual(manual: HelpManual, query: string): HelpSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return manual.sections
  const hit = (text: string) => words.every(w => text.includes(w))
  return manual.sections.flatMap(section => {
    const sectionText = `${section.title} ${section.summary}`.toLowerCase()
    if (hit(sectionText)) return [section]
    const articles = section.articles.filter(a => hit(`${sectionText} ${articleText(a)}`))
    return articles.length ? [{ ...section, articles }] : []
  })
}
