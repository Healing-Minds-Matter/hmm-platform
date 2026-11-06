'use client'

// The on-screen certificate (Stories 10.3, 10.4): the same model and measurements
// as the PDF (lib/certificate-pdf.server.ts). With `editor`, boxes can be
// selected, dragged and moved with the arrow keys (Story 10.3 Sc03).

import './certificate-fonts.css'
import {
  FRAMES, LINE_HEIGHT, PAGE_BACKGROUND, RULE_COLOR_OVER, RULE_GAP, RULE_WIDTH, UPPER_TRACKING,
  colorValue, fillPlaceholders, orientationOf, type Design, type DesignItem, type PlaceholderValues,
} from '@/lib/certificate-design'

export type PreviewEditor = {
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}

export function CertificatePreview({ design, values, assets, editor, maxWidth }: {
  design: Design
  values: PlaceholderValues
  assets: Record<string, string>      // storage path → signed URL
  editor?: PreviewEditor
  maxWidth?: number
}) {
  const portrait = orientationOf(design) === 'portrait'
  const bg = design.source === 'template' && design.bg ? assets[design.bg] : null

  const startDrag = (e: React.PointerEvent, it: DesignItem) => {
    const page = (e.currentTarget as HTMLElement).closest('.cert-page')
    if (!editor || !page) return
    e.preventDefault()
    editor.onSelect(it.id)
    const rect = page.getBoundingClientRect()
    const start = { px: e.clientX, py: e.clientY, x: it.x, y: it.y }
    const target = e.currentTarget as HTMLElement
    // preventDefault() stops the browser focusing the box, so focus it here: the arrow keys then work straight away.
    target.focus({ preventScroll: true })
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const x = start.x + ((ev.clientX - start.px) / rect.width) * 100
      const y = start.y + ((ev.clientY - start.py) / rect.height) * 100
      editor.onMove(it.id, Math.round(x * 2) / 2, Math.round(y * 2) / 2)
    }
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up) }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  const onKey = (e: React.KeyboardEvent, it: DesignItem) => {
    if (!editor) return
    const step = e.shiftKey ? 2 : 0.5
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (d) { e.preventDefault(); editor.onMove(it.id, it.x + d[0], it.y + d[1]) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.onSelect(it.id) }
  }

  return (
    <div
      className={`cert-page${editor ? ' editable' : ''} w-full shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)]`}
      style={{
        aspectRatio: portrait ? '210 / 297' : '297 / 210',
        maxWidth: maxWidth ?? (portrait ? 470 : 720),
        background: bg ? `url("${bg}") center / 100% 100% no-repeat, ${PAGE_BACKGROUND.template}` : design.source === 'template' ? PAGE_BACKGROUND.template : PAGE_BACKGROUND.layout,
        outline: design.source === 'template' && !bg ? '2px dashed #CBD5E1' : undefined,
        outlineOffset: -10,
      }}
      role={editor ? 'group' : 'img'}
      aria-label={editor ? 'Certificate layout. Drag a box to move it, or focus one and use the arrow keys.' : 'Certificate preview'}
      onPointerDown={editor ? e => { if (e.target === e.currentTarget) editor.onSelect(null) } : undefined}
    >
      {design.source === 'layout' && FRAMES[design.layout].map((s, i) => {
        const color = s.color === 'c1' ? design.c1 : design.c2
        return s.kind === 'rect'
          ? <div key={i} aria-hidden className="pointer-events-none absolute" style={{ inset: `${s.inset}cqw`, border: `${s.width}cqw solid ${color}` }} />
          : <div key={i} aria-hidden className="pointer-events-none absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, background: color }} />
      })}

      {design.items.map(it => {
        const common = {
          'data-item': it.id,
          className: `cert-item ${editor?.selected === it.id ? 'selected' : ''}`,
          tabIndex: editor ? 0 : undefined,
          role: editor ? 'button' : undefined,
          onPointerDown: editor ? (e: React.PointerEvent) => startDrag(e, it) : undefined,
          onKeyDown: editor ? (e: React.KeyboardEvent) => onKey(e, it) : undefined,
        }
        if (it.kind === 'image') {
          const url = assets[it.src]
          return (
            <div key={it.id} {...common} aria-label={editor ? `Image: ${it.name}` : undefined} className={`${common.className} absolute`}
              style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, aspectRatio: `1 / ${it.aspect}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {url ? <img src={url} alt="" draggable={false} className="cert-img h-full w-full" /> : <div className="h-full w-full bg-[#F1F5F9]" />}
            </div>
          )
        }
        const line = it.line === 'under'
          ? { borderBottom: `${RULE_WIDTH.under}cqw solid ${design.c2}`, paddingBottom: `${RULE_GAP}em` }
          : it.line === 'over' ? { borderTop: `${RULE_WIDTH.over}cqw solid ${RULE_COLOR_OVER}`, paddingTop: `${RULE_GAP}em` } : {}
        const shown = fillPlaceholders(it.text, values)
        return (
          <div key={it.id} {...common} aria-label={editor ? `Text box: ${it.text.split('\n')[0].slice(0, 40) || '(empty)'}` : undefined}
            className={`${common.className} cert-text ${it.font}`}
            style={{
              left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%`, fontSize: `${it.size}cqw`, lineHeight: LINE_HEIGHT,
              fontWeight: Number(it.weight), fontStyle: it.italic ? 'italic' : 'normal', textAlign: it.align,
              color: colorValue(it.color, design),
              textTransform: it.upper ? 'uppercase' : undefined, letterSpacing: it.upper ? `${UPPER_TRACKING}em` : undefined,
              ...line,
            }}>
            {shown || (editor ? <span className="opacity-40">(empty)</span> : null)}
          </div>
        )
      })}
    </div>
  )
}
