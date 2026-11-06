import 'server-only'
// Draws a certificate design as an A4 PDF (Stories 10.3 Sc09, 10.5 Sc04, 10.6).
// Uses the same model and measurements as the on-screen preview
// (lib/certificate-design.ts) and the same font files the preview loads
// (public/fonts/cert), so the PDF matches what the designer shows.
// Sinhala and Tamil are shaped by pdfkit's font engine (fontkit); each text box
// is split into runs so those letters use the Noto Sinhala/Tamil fonts.

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'
import {
  FRAMES, LINE_HEIGHT, PAGE_BACKGROUND, RULE_COLOR_OVER, RULE_GAP, RULE_WIDTH, UPPER_TRACKING,
  colorValue, fillPlaceholders, orientationOf, pageSize, splitRuns,
  type Design, type PlaceholderValues, type Script, type TextItem,
} from '@/lib/certificate-design'

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'cert')
const FILES: Record<string, string> = {
  'latin-serif-400-n': 'NotoSerif-Regular.ttf', 'latin-serif-700-n': 'NotoSerif-Bold.ttf',
  'latin-serif-400-i': 'NotoSerif-Italic.ttf', 'latin-serif-700-i': 'NotoSerif-BoldItalic.ttf',
  'latin-sans-400-n': 'NotoSans-Regular.ttf', 'latin-sans-700-n': 'NotoSans-Bold.ttf',
  'latin-sans-400-i': 'NotoSans-Italic.ttf', 'latin-sans-700-i': 'NotoSans-BoldItalic.ttf',
  // Sinhala and Tamil have no italic; the preview turns off fake italics to match.
  'sinhala-400': 'NotoSansSinhala-Regular.ttf', 'sinhala-700': 'NotoSansSinhala-Bold.ttf',
  'tamil-400': 'NotoSansTamil-Regular.ttf', 'tamil-700': 'NotoSansTamil-Bold.ttf',
}
let fontCache: Map<string, Buffer> | null = null
function fonts(): Map<string, Buffer> {
  if (!fontCache) fontCache = new Map(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(FONT_DIR, f))]))
  return fontCache
}
function fontKey(script: Script, it: Pick<TextItem, 'font' | 'weight' | 'italic'>): string {
  return script === 'latin' ? `latin-${it.font}-${it.weight}-${it.italic ? 'i' : 'n'}` : `${script}-${it.weight}`
}

export type AssetLoader = (storagePath: string) => Promise<Buffer | null>

export async function renderCertificatePdf(design: Design, values: PlaceholderValues, loadAsset: AssetLoader): Promise<Buffer> {
  const orient = orientationOf(design)
  const { w: W, h: H } = pageSize(orient)
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true, info: { Title: values.certification_name || 'Certificate', Producer: 'Healing Minds Matter' } })
  for (const [k, buf] of fonts()) doc.registerFont(k, buf)
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))

  // Page and frame
  doc.rect(0, 0, W, H).fill(design.source === 'template' ? PAGE_BACKGROUND.template : PAGE_BACKGROUND.layout)
  if (design.source === 'template' && design.bg) {
    const bg = await loadAsset(design.bg)
    if (bg) doc.image(bg, 0, 0, { width: W, height: H })
  } else if (design.source === 'layout') {
    for (const s of FRAMES[design.layout]) {
      const color = s.color === 'c1' ? design.c1 : design.c2
      if (s.kind === 'rect') {
        const lw = (s.width / 100) * W
        const off = (s.inset / 100) * W + lw / 2
        doc.save().lineWidth(lw).strokeColor(color).rect(off, off, W - 2 * off, H - 2 * off).stroke().restore()
      } else {
        doc.rect((s.x / 100) * W, (s.y / 100) * H, (s.w / 100) * W, (s.h / 100) * H).fill(color)
      }
    }
  }

  for (const it of design.items) {
    const x = (it.x / 100) * W
    const y = (it.y / 100) * H
    const width = (it.w / 100) * W
    if (it.kind === 'image') {
      const buf = await loadAsset(it.src)
      if (!buf) continue
      if (it.src.endsWith('.svg')) {
        SVGtoPDF(doc, buf.toString('utf8'), x, y, { width, height: width * it.aspect, assumePt: true })
      } else {
        doc.image(buf, x, y, { width, height: width * it.aspect })
      }
      continue
    }
    drawText(doc, it, design, values, x, y, width, W)
  }

  doc.end()
  return finished
}

type Doc = InstanceType<typeof PDFDocument>

function drawText(doc: Doc, it: TextItem, design: Design, values: PlaceholderValues, x: number, y: number, width: number, W: number) {
  const size = (it.size / 100) * W
  let text = fillPlaceholders(it.text, values)
  if (it.upper) text = text.toUpperCase()
  if (!text.trim()) return
  const color = colorValue(it.color, design)
  const tracking = it.upper ? UPPER_TRACKING * size : 0

  let top = y
  if (it.line === 'over') {
    const rw = (RULE_WIDTH.over / 100) * W
    doc.save().lineWidth(rw).strokeColor(RULE_COLOR_OVER).moveTo(x, y + rw / 2).lineTo(x + width, y + rw / 2).stroke().restore()
    top += rw + RULE_GAP * size
  }

  // Lines are laid out here rather than by pdfkit, because a line can mix fonts
  // (Latin, Sinhala, Tamil) and pdfkit can't wrap or centre mixed fonts together.
  // Every line is LINE_HEIGHT × size tall with the Latin font's glyphs centred in
  // it, as CSS does; all pieces of a line share that baseline.
  const metrics = (key: string) => {
    doc.font(key).fontSize(size)
    const f = (doc as unknown as { _font: { ascender: number; descender: number } })._font
    return { asc: (f.ascender / 1000) * size, desc: (f.descender / 1000) * size }
  }
  const latin = metrics(fontKey('latin', it))
  const lineH = LINE_HEIGHT * size
  const baselineOffset = (lineH - (latin.asc - latin.desc)) / 2 + latin.asc
  const ascOf = new Map<string, number>()
  const measure = (key: string, s: string) => {
    doc.font(key).fontSize(size)
    return doc.widthOfString(s, { characterSpacing: tracking })
  }

  type Piece = { key: string; text: string; w: number }
  const lines: Piece[][] = []
  for (const para of text.split('\n')) {
    let line: Piece[] = []
    let lineW = 0
    // Break opportunities are spaces; a word may mix scripts ("{full_name},").
    for (const token of para.split(/(\s+)/).filter(t => t.length)) {
      const space = /^\s+$/.test(token)
      const pieces = splitRuns(token).map(r => {
        const key = fontKey(r.script, it)
        return { key, text: r.text, w: measure(key, r.text) }
      })
      const tw = pieces.reduce((s, p) => s + p.w, 0)
      if (!space && line.length && lineW + tw > width + 0.01) {
        lines.push(line)
        line = []
        lineW = 0
      }
      if (space && !line.length) continue
      line.push(...pieces)
      lineW += tw
    }
    lines.push(line)
  }

  doc.fillColor(color)
  lines.forEach((line, li) => {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
    const lw = line.reduce((s, p) => s + p.w, 0)
    let cx = it.align === 'center' ? x + (width - lw) / 2 : it.align === 'right' ? x + width - lw : x
    const baseline = top + li * lineH + baselineOffset
    for (const p of line) {
      if (!ascOf.has(p.key)) ascOf.set(p.key, metrics(p.key).asc)
      doc.font(p.key).fontSize(size).fillColor(color)
      doc.text(p.text, cx, baseline - ascOf.get(p.key)!, { lineBreak: false, characterSpacing: tracking })
      cx += p.w
    }
  })
  const textBottom = top + lines.length * lineH
  if (it.line === 'under') {
    const rw = (RULE_WIDTH.under / 100) * W
    const ry = textBottom + RULE_GAP * size + rw / 2
    doc.save().lineWidth(rw).strokeColor(design.c2).moveTo(x, ry).lineTo(x + width, ry).stroke().restore()
  }
}
