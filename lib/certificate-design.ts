// Digital certificate designs (Epic 10, Stories 10.3 and 10.4). One model shared
// by the on-screen preview (components/certifications/certificate-preview.tsx)
// and the PDF (lib/certificate-pdf.server.ts), so both place things the same way.
//
// Units: x and w are % of the page width, y is % of the page height, text size
// is % of the page width. Frames are drawn from simple rectangles defined here,
// rather than from CSS borders, so the PDF can draw exactly the same thing.

import { formatCertDate } from '@/lib/certification-types'

export type Orientation = 'landscape' | 'portrait'
export type LayoutId = 'classic' | 'modern' | 'portrait'
export type TextColor = 'c1' | 'c2' | 'dark' | 'grey'
export type FontId = 'serif' | 'sans'
export type LineStyle = 'none' | 'under' | 'over'

export type TextItem = {
  id: string; kind: 'text'; text: string
  x: number; y: number; w: number; size: number
  font: FontId; weight: '400' | '700'; italic: boolean; upper: boolean
  align: 'left' | 'center' | 'right'; color: TextColor; line: LineStyle
}
export type ImageItem = {
  id: string; kind: 'image'; src: string; name: string
  x: number; y: number; w: number
  aspect: number        // height ÷ width of the image itself
}
export type DesignItem = TextItem | ImageItem

export type Design = {
  source: 'layout' | 'template'
  layout: LayoutId            // used when source = 'layout'
  orient: Orientation         // used when source = 'template'
  bg: string | null           // template artwork (storage path), when source = 'template'
  bgName: string
  c1: string                  // text colour
  c2: string                  // accent colour
  items: DesignItem[]
}

export const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'classic', label: 'Landscape classic' },
  { id: 'modern', label: 'Landscape modern' },
  { id: 'portrait', label: 'Portrait' },
]

export const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: 'serif', label: 'Serif (with Sinhala and Tamil)' },
  { id: 'sans', label: 'Sans-serif (with Sinhala and Tamil)' },
]

export const COLOR_OPTIONS: { id: TextColor; label: string }[] = [
  { id: 'c1', label: 'Text colour' }, { id: 'c2', label: 'Accent colour' }, { id: 'dark', label: 'Near black' }, { id: 'grey', label: 'Grey' },
]

export function orientationOf(d: Pick<Design, 'source' | 'layout' | 'orient'>): Orientation {
  return d.source === 'template' ? d.orient : d.layout === 'portrait' ? 'portrait' : 'landscape'
}

// A4 in PDF points.
export function pageSize(o: Orientation): { w: number; h: number } {
  return o === 'portrait' ? { w: 595.28, h: 841.89 } : { w: 841.89, h: 595.28 }
}

export function colorValue(c: TextColor, d: Pick<Design, 'c1' | 'c2'>): string {
  return { c1: d.c1, c2: d.c2, dark: '#1F2937', grey: '#6B7280' }[c]
}

export const PAGE_BACKGROUND = { layout: '#FFFDF8', template: '#FFFFFF' }

// Frame shapes per layout. inset/width as % of the page width; fills as % of width/height.
export type FrameShape =
  | { kind: 'rect'; inset: number; width: number; color: 'c1' | 'c2' }
  | { kind: 'fill'; x: number; y: number; w: number; h: number; color: 'c1' | 'c2' }
export const FRAMES: Record<LayoutId, FrameShape[]> = {
  classic: [
    { kind: 'rect', inset: 0.4, width: 0.45, color: 'c1' },
    { kind: 'rect', inset: 1.05, width: 0.45, color: 'c1' },
    { kind: 'rect', inset: 2.3, width: 0.28, color: 'c2' },
  ],
  modern: [
    { kind: 'fill', x: 0, y: 0, w: 3, h: 100, color: 'c1' },
    { kind: 'fill', x: 0, y: 0, w: 3, h: 30, color: 'c2' },
  ],
  portrait: [
    { kind: 'rect', inset: 0.25, width: 0.45, color: 'c1' },
    { kind: 'rect', inset: 2.3, width: 1.25, color: 'c2' },
  ],
}

// Text layout constants, shared by preview and PDF.
export const LINE_HEIGHT = 1.35
export const UPPER_TRACKING = 0.12           // letter spacing in em for Capital letters
export const RULE_GAP = 0.3                  // em between text and its line
export const RULE_WIDTH = { under: 0.28, over: 0.14 }   // % of page width
export const RULE_COLOR_OVER = '#9CA3AF'

// ── Placeholders (Story 10.3 Sc05) ───────────────────────────────────────────
export const PLACEHOLDERS = ['full_name', 'certification_name', 'date_achieved', 'expiry_date', 'certificate_number', 'club_name', 'issuing_body'] as const
export type Placeholder = (typeof PLACEHOLDERS)[number]
export type PlaceholderValues = Record<Placeholder, string>

export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(/\{(full_name|certification_name|date_achieved|expiry_date|certificate_number|club_name|issuing_body)\}/g, (_, k: Placeholder) => values[k])
}

export const placeholderValues = (asPlaceholders = true): PlaceholderValues =>
  Object.fromEntries(PLACEHOLDERS.map(k => [k, asPlaceholders ? `{${k}}` : ''])) as PlaceholderValues

type TypeForValues = { name: string; code: string; issuing_body: string | null }

export function certificateValues(t: TypeForValues, c: {
  fullName: string; clubName: string | null; achievedOn: string; expiresOn: string | null; certificateNumber: string | null
}): PlaceholderValues {
  return {
    full_name: c.fullName,
    certification_name: t.name,
    date_achieved: formatCertDate(c.achievedOn),
    expiry_date: c.expiresOn ? formatCertDate(c.expiresOn) : 'Lifetime',
    certificate_number: c.certificateNumber ?? '',
    club_name: c.clubName ?? '',
    issuing_body: t.issuing_body || 'Healing Minds Matter',
  }
}

// A made-up person for previews.
export function sampleValues(t: TypeForValues & { validity_value: number | null; validity_unit: 'months' | 'years' | null }, year = 2026): PlaceholderValues {
  const achieved = `${year}-03-12`
  let expires: string | null = null
  if (t.validity_value != null && t.validity_unit) {
    const months = t.validity_unit === 'years' ? t.validity_value * 12 : t.validity_value
    const d = new Date(Date.UTC(year, 2 + months, 12))
    expires = d.toISOString().slice(0, 10)
  }
  return certificateValues(t, {
    fullName: 'Nadeesha Perera', clubName: 'Kandy Chapter', achievedOn: achieved, expiresOn: expires,
    certificateNumber: `HMM-${t.code}-${year}-000041`,
  })
}

// ── Scripts (Story 10.3 Sc06) ────────────────────────────────────────────────
// Sinhala and Tamil letters use their own Noto fonts; everything else uses the box's
// Latin font. Joiners and marks stay with the letters around them.
export type Script = 'latin' | 'sinhala' | 'tamil'
function scriptOf(ch: string): Script | null {
  const cp = ch.codePointAt(0)!
  if (cp >= 0x0d80 && cp <= 0x0dff) return 'sinhala'
  if (cp >= 0x0b80 && cp <= 0x0bff) return 'tamil'
  if (cp === 0x200c || cp === 0x200d) return null          // ZWNJ / ZWJ: belong to the current run
  if (/\s/.test(ch)) return null                             // spaces join whatever comes before
  return 'latin'
}
export function splitRuns(text: string): { script: Script; text: string }[] {
  const runs: { script: Script; text: string }[] = []
  for (const ch of Array.from(text)) {
    const s = scriptOf(ch)
    const last = runs[runs.length - 1]
    if (s === null) { if (last) last.text += ch; else runs.push({ script: 'latin', text: ch }); continue }
    if (last && last.script === s) last.text += ch
    else if (last && /^\s*$/.test(last.text)) { last.script = s; last.text += ch }
    else runs.push({ script: s, text: ch })
  }
  return runs
}

// ── Defaults (from the approved prototype) ───────────────────────────────────
let seq = 0
export const newItemId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`

const text = (id: string, t: string, x: number, y: number, w: number, size: number, o: Partial<TextItem> = {}): TextItem => ({
  id, kind: 'text', text: t, x, y, w, size, font: 'serif', weight: '400', italic: false, upper: false, align: 'center', color: 'dark', line: 'none', ...o,
})

export function defaultItems(title = 'Certificate of Completion'): DesignItem[] {
  return [
    text('org', 'Healing Minds Matter', 10, 9, 80, 1.5, { font: 'sans', weight: '700', upper: true, color: 'c1' }),
    text('title', title, 10, 15, 80, 4.2, { weight: '700', color: 'c1' }),
    text('presented', 'This is presented to', 20, 31, 60, 1.5),
    text('name', '{full_name}', 20, 37, 60, 4.6, { italic: true, line: 'under' }),
    text('body', 'of {club_name}, for completing {certification_name}, awarded by {issuing_body} on {date_achieved}. Valid until {expiry_date}.', 15, 54, 70, 1.5),
    text('sig1', 'Programme Director', 18, 76, 26, 1.2, { line: 'over' }),
    text('sig2', 'HMM Chairperson', 56, 76, 26, 1.2, { line: 'over' }),
    text('foot', 'Issued by Healing Minds Matter', 6, 89, 44, 1, { font: 'sans', align: 'left', color: 'grey' }),
    text('num', 'Certificate No. {certificate_number}', 50, 89, 44, 1, { font: 'sans', align: 'right', color: 'grey' }),
  ]
}

export function defaultDesign(): Design {
  return { source: 'layout', layout: 'classic', orient: 'landscape', bg: null, bgName: '', c1: '#012C51', c2: '#F4AC1E', items: defaultItems() }
}

export function newTextItem(): TextItem {
  return text(newItemId(), 'New text', 30, 45, 40, 1.6)
}

export function designLabel(d: Pick<Design, 'source' | 'layout' | 'bgName'>): string {
  if (d.source === 'template') return `Own template${d.bgName ? ` (${d.bgName})` : ''}`
  return LAYOUTS.find(l => l.id === d.layout)?.label ?? 'Layout'
}

// ── Checking a design before it's saved or drawn ─────────────────────────────
// Designs come from the browser, so everything is checked and clamped here.
export const MAX_ITEMS = 60
export const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
const HEX = /^#[0-9a-f]{6}$/i
const ASSET = /^designs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|svg)$/i

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

// The asset paths a design may use must belong to its own type.
export function cleanDesign(input: unknown, typeId: string): { design: Design } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'The design couldn’t be read.' }
  const d = input as Record<string, unknown>
  const ownAsset = (p: unknown) => typeof p === 'string' && ASSET.test(p) && p.startsWith(`designs/${typeId}/`)
  const source = pick(d.source, ['layout', 'template'] as const, 'layout')
  const bg = ownAsset(d.bg) && !(d.bg as string).endsWith('.svg') ? (d.bg as string) : null
  if (source === 'template' && !bg) return { error: 'Upload your template artwork, or choose a built-in layout.' }
  const rawItems = Array.isArray(d.items) ? d.items : []
  if (rawItems.length > MAX_ITEMS) return { error: `A design can have at most ${MAX_ITEMS} text boxes and images.` }
  const ids = new Set<string>()
  const items: DesignItem[] = []
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, unknown>
    let id = str(it.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || newItemId()
    while (ids.has(id)) id = newItemId()
    ids.add(id)
    if (it.kind === 'image') {
      if (!ownAsset(it.src)) continue
      items.push({ id, kind: 'image', src: it.src as string, name: str(it.name, 120) || 'image',
        x: num(it.x, -50, 100, 40), y: num(it.y, -50, 100, 40), w: num(it.w, 1, 100, 10), aspect: num(it.aspect, 0.01, 100, 1) })
    } else {
      items.push({
        id, kind: 'text', text: str(it.text, 1000),
        x: num(it.x, -50, 100, 10), y: num(it.y, -50, 100, 10), w: num(it.w, 2, 100, 60), size: num(it.size, 0.4, 15, 1.5),
        font: pick(it.font, ['serif', 'sans'] as const, 'serif'), weight: pick(it.weight, ['400', '700'] as const, '400'),
        italic: it.italic === true, upper: it.upper === true,
        align: pick(it.align, ['left', 'center', 'right'] as const, 'center'), color: pick(it.color, ['c1', 'c2', 'dark', 'grey'] as const, 'dark'),
        line: pick(it.line, ['none', 'under', 'over'] as const, 'none'),
      })
    }
  }
  return {
    design: {
      source, layout: pick(d.layout, ['classic', 'modern', 'portrait'] as const, 'classic'),
      orient: pick(d.orient, ['landscape', 'portrait'] as const, 'landscape'),
      bg: source === 'template' ? bg : null, bgName: source === 'template' ? str(d.bgName, 120) : '',
      c1: typeof d.c1 === 'string' && HEX.test(d.c1) ? d.c1 : '#012C51',
      c2: typeof d.c2 === 'string' && HEX.test(d.c2) ? d.c2 : '#F4AC1E',
      items,
    },
  }
}

export function designAssets(d: Design): string[] {
  return [...new Set([...(d.bg ? [d.bg] : []), ...d.items.flatMap(i => (i.kind === 'image' ? [i.src] : []))])]
}

// Rejects SVGs that could run code if opened on their own.
export function unsafeSvg(svg: string): boolean {
  return /<script|on[a-z]+\s*=|javascript:|<foreignObject/i.test(svg)
}

// Design versions are never overwritten: editing any version (the current one or an
// older one) opens the designer on a copy, and saving creates the next version.
export const EDIT_COPY_LABEL = 'Edit a copy'
export const EDIT_COPY_HINT = 'Creates a new version based on this one. Certificates already issued keep their design.'
export function editStartLabel(currentVersion: number | null, startVersion: number | null): string {
  if (currentVersion == null || startVersion == null) return 'New design.'
  return `Editing a copy of version ${startVersion}${startVersion === currentVersion ? ' (current)' : ''}. Saving creates version ${currentVersion + 1}.`
}
