// The in-portal user manual (sheet row 55). Content lives in this folder as
// typed data — one file per portal — so it is reviewed and versioned like code.

export type HelpArticle = {
  /** Anchor id, unique within the manual. */
  id: string
  title: string
  /** A sentence or two of context. */
  intro?: string
  /** The steps to follow, in order (shown as a numbered list). */
  steps?: string[]
  /** Points that aren't steps (shown as a bulleted list). */
  notes?: string[]
}

export type HelpSection = {
  /** Anchor id; also what the header's ? icon opens for matching pages. */
  id: string
  title: string
  summary: string
  /** Portal paths this section is about (prefix match), for contextual help. */
  paths: string[]
  articles: HelpArticle[]
}

export type HelpManual = {
  portal: 'super_admin' | 'champion'
  title: string
  sections: HelpSection[]
}
