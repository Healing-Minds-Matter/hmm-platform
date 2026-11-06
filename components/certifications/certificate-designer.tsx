'use client'

// The certificate designer (Story 10.3): start from a layout or own artwork,
// edit every text box, add and move images, preview with a sample person or the
// placeholders, download or print exactly what's shown, and save as a new version.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CertificatePreview } from '@/components/certifications/certificate-preview'
import { downloadBlob, fetchPdf, printBlob } from '@/components/certifications/pdf-actions'
import { CANCEL_BTN, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import {
  COLOR_OPTIONS, FONT_OPTIONS, LAYOUTS, PLACEHOLDERS, newItemId, newTextItem,
  type Design, type DesignItem, type ImageItem, type PlaceholderValues, type TextItem,
} from '@/lib/certificate-design'
import { saveDesignAction, uploadDesignAssetAction } from '@/actions/certificate-designs'

const SMALL_BTN = 'rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F1F5F9]'
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const boxLabel = (it: DesignItem) => (it.kind === 'image' ? `Image: ${it.name}` : (it.text || '(empty)').split('\n')[0]).slice(0, 28)

// Height ÷ width of an uploaded image, measured in the browser.
function measureAspect(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve(img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(1); URL.revokeObjectURL(url) }
    img.src = url
  })
}

export function CertificateDesigner({ typeId, typeName, lifetime, start, startLabel, nextVersion, assets: initialAssets, sample, placeholders }: {
  typeId: string
  typeName: string
  lifetime: boolean
  start: Design                  // the version being edited (or the default for a new design)
  startLabel: string             // "New design." / "Editing version 3." / "Editing a copy of version 1."
  nextVersion: number
  assets: Record<string, string>
  sample: PlaceholderValues
  placeholders: PlaceholderValues
}) {
  const router = useRouter()
  const [design, setDesign] = useState<Design>(() => structuredClone(start))
  const [selected, setSelected] = useState<string | null>(null)
  const [asPlaceholders, setAsPlaceholders] = useState(false)
  const [assets, setAssets] = useState(initialAssets)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isNew = startLabel.startsWith('New')
  // dirty = edited since the page opened. A new design can be saved untouched (its starting
  // layout is a real design), but leaving it untouched loses nothing, so it doesn't warn.
  const dirty = useMemo(() => JSON.stringify(design) !== JSON.stringify(start), [design, start])
  const canSave = isNew || dirty

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (patch: Partial<Design>) => setDesign(d => ({ ...d, ...patch }))
  const updateItem = (id: string, patch: Partial<TextItem> | Partial<ImageItem>) =>
    setDesign(d => ({ ...d, items: d.items.map(i => (i.id === id ? ({ ...i, ...patch } as DesignItem) : i)) }))
  const item = design.items.find(i => i.id === selected) ?? null

  const upload = async (file: File, kind: 'template' | 'image') => {
    const fd = new FormData()
    fd.set('type_id', typeId)
    fd.set('kind', kind)
    fd.set('file', file)
    const res = await uploadDesignAssetAction(fd)
    if ('error' in res) throw new Error(res.error)
    setAssets(a => ({ ...a, [res.path]: res.url }))
    return res
  }

  const onTemplate = async (file: File | undefined) => {
    if (!file) return
    setError(null); setBusy('Uploading template…')
    try {
      const res = await upload(file, 'template')
      const aspect = await measureAspect(file)
      set({ bg: res.path, bgName: res.name, orient: aspect > 1 ? 'portrait' : 'landscape' })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const onImages = async (files: FileList | null, replaceId?: string) => {
    if (!files?.length) return
    setError(null); setBusy(files.length > 1 ? `Uploading ${files.length} images…` : 'Uploading image…')
    const errors: string[] = []
    for (const file of Array.from(files)) {
      try {
        const [res, aspect] = await Promise.all([upload(file, 'image'), measureAspect(file)])
        if (replaceId) {
          updateItem(replaceId, { src: res.path, name: res.name, aspect })
        } else {
          const id = newItemId()
          setDesign(d => ({ ...d, items: [...d.items, { id, kind: 'image', src: res.path, name: res.name, x: 44, y: 40, w: 12, aspect }] }))
          setSelected(id)
        }
      } catch (e) { errors.push((e as Error).message) }
    }
    setBusy(null)
    if (errors.length) setError(errors.join(' '))
  }

  const pdf = async (mode: 'download' | 'print') => {
    setError(null); setBusy(mode === 'download' ? 'Making the PDF…' : 'Preparing to print…')
    try {
      const blob = await fetchPdf(`/super-admin/certifications/${typeId}/design/pdf`, { design, placeholders: asPlaceholders })
      if (mode === 'download') downloadBlob(blob, `${typeName} certificate design.pdf`)
      else printBlob(blob)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const save = async () => {
    setError(null); setBusy('Saving…')
    const res = await saveDesignAction(typeId, design)
    if ('error' in res) { setError(res.error); setBusy(null); return }
    router.push(`/super-admin/certifications/${typeId}?design_saved=${res.version}`)
  }

  const discard = () => { setDesign(structuredClone(start)); setSelected(null); setError(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Digital certificate design · {typeName}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#475569]">
            {startLabel} {dirty ? 'Unsaved changes.' : isNew ? 'Not saved yet.' : 'No unsaved changes.'} Saving creates version {nextVersion}; certificates already issued keep the version they were made with.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button type="button" onClick={discard} disabled={!dirty || !!busy} className={`${CANCEL_BTN} disabled:cursor-not-allowed disabled:opacity-50`}>Discard changes</button>
          <button type="button" onClick={save} disabled={!canSave || !!busy} className={PRIMARY_BTN}>Save as version {nextVersion}</button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-medium text-[#DC2626]">{error}</div>}
      {busy && <div role="status" className="rounded-lg bg-[#EFF6FF] px-4 py-2.5 text-[13px] font-medium text-[#265BA2]">{busy}</div>}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Settings */}
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5" aria-label="Design settings">
          <fieldset>
            <legend className={LABEL}>Start from</legend>
            <div className="flex flex-col gap-2">
              <label className={OPTION}>
                <input type="radio" name="source" checked={design.source === 'layout'} onChange={() => set({ source: 'layout' })} className="mt-0.5 accent-[#022C51]" />
                A built-in layout
              </label>
              <label className={OPTION}>
                <input type="radio" name="source" checked={design.source === 'template'} onChange={() => set({ source: 'template' })} className="mt-0.5 accent-[#022C51]" />
                <span>My own template<span className="block text-[11px] font-normal text-[#64748B]">Upload your certificate artwork. Text boxes and images go on top of it.</span></span>
              </label>
            </div>
          </fieldset>

          {design.source === 'layout' ? (
            <div>
              <span className={LABEL}>Layout</span>
              <div className="grid grid-cols-3 gap-2">
                {LAYOUTS.map(l => (
                  <button key={l.id} type="button" aria-pressed={design.layout === l.id} onClick={() => set({ layout: l.id })}
                    className={`rounded-lg border p-2 text-center text-[11px] font-semibold ${design.layout === l.id ? 'border-[#022C51] text-[#022C51] shadow-[inset_0_0_0_1px_#022C51]' : 'border-[#E2E8F0] text-[#475569]'}`}>
                    <span className="mx-auto mb-1.5 block rounded-[3px] border border-[#E2E8F0] bg-[#F8FAFC]" style={l.id === 'portrait' ? { width: 26, height: 36 } : { width: 46, height: 32 }} />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className={LABEL} htmlFor="d-template">Template file</label>
                <input id="d-template" type="file" accept="image/png,image/jpeg" onChange={e => { void onTemplate(e.target.files?.[0]); e.target.value = '' }}
                  className="block w-full text-[13px] text-[#475569] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F5F9] file:px-3 file:py-2 file:text-[13px] file:font-medium" />
                <p className={HINT}>{design.bgName ? <>Using <b>{design.bgName}</b>. Choose another file to replace it.</> : 'PNG or JPG of the whole A4 page, up to 5 MB. Then move the text boxes to where they belong.'}</p>
              </div>
              <fieldset>
                <legend className={LABEL}>Page</legend>
                <div className="flex gap-4 text-[13px]">
                  {(['landscape', 'portrait'] as const).map(o => (
                    <label key={o} className="flex items-center gap-1.5">
                      <input type="radio" name="orient" checked={design.orient === o} onChange={() => set({ orient: o })} className="accent-[#022C51]" />
                      {o === 'landscape' ? 'Landscape' : 'Portrait'}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            {([['c1', 'Text colour'], ['c2', 'Accent colour']] as const).map(([k, label]) => (
              <div key={k}>
                <label className={LABEL} htmlFor={`d-${k}`}>{label}</label>
                <input id={`d-${k}`} type="color" value={design[k]} onChange={e => set({ [k]: e.target.value } as Partial<Design>)} className="h-10 w-full cursor-pointer rounded-lg border border-[#E2E8F0] bg-white" />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-[13px] font-bold text-[#0F172A]">Text boxes and images</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Text boxes and images">
              {design.items.map(i => (
                <button key={i.id} type="button" aria-pressed={i.id === selected} onClick={() => setSelected(i.id)}
                  className={`max-w-full truncate rounded-md border px-2 py-1 text-xs ${i.id === selected ? 'border-[#022C51] bg-[#EFF6FF] font-semibold text-[#022C51]' : 'border-[#E2E8F0] bg-white text-[#475569]'}`}>
                  {boxLabel(i)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={SMALL_BTN} onClick={() => { const t = newTextItem(); setDesign(d => ({ ...d, items: [...d.items, t] })); setSelected(t.id) }}>+ Add text box</button>
              <label className={`${SMALL_BTN} cursor-pointer`}>
                + Add images
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" multiple className="sr-only" onChange={e => { void onImages(e.target.files); e.target.value = '' }} />
              </label>
            </div>
            <p className={HINT}>Images: PNG, JPG or SVG, up to 2 MB each, for logos, signatures, seals or photos. You can pick several at once.</p>
            {item ? <ItemEditor key={item.id} item={item} update={p => updateItem(item.id, p)} onReplace={f => onImages(f, item.id)}
              onDelete={() => { setDesign(d => ({ ...d, items: d.items.filter(i => i.id !== item.id) })); setSelected(null) }} /> : (
              <p className={HINT}>Click a box on the certificate (or pick one above) to edit it. Drag boxes to move them, or focus one and use the arrow keys (Shift moves further).</p>
            )}
          </div>
          <p className={HINT}>
            Placeholders are filled in for each person: {PLACEHOLDERS.map(k => <code key={k} className="mr-1 rounded bg-[#F1F5F9] px-1 font-mono text-[10px]">{`{${k}}`}</code>)}
            {lifetime && ' For this Lifetime type, {expiry_date} prints “Lifetime”.'}
          </p>
        </section>

        {/* Preview */}
        <section className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-3" aria-label="Preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg bg-[#F1F5F9] p-1" role="group" aria-label="Preview with">
              {[[false, 'Sample person'], [true, 'Placeholders']].map(([v, label]) => (
                <button key={String(v)} type="button" aria-pressed={asPlaceholders === v} onClick={() => setAsPlaceholders(v as boolean)}
                  className={`rounded-[5px] px-3 py-1 text-xs font-semibold ${asPlaceholders === v ? 'bg-[#022C51] text-white' : 'text-[#475569]'}`}>{label as string}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className={SMALL_BTN} disabled={!!busy} onClick={() => pdf('download')}>Download PDF</button>
              <button type="button" className={SMALL_BTN} disabled={!!busy} onClick={() => pdf('print')}>Print</button>
            </div>
          </div>
          <div className="grid place-items-center overflow-auto rounded-2xl bg-[#E2E8F0]/60 p-4">
            <CertificatePreview design={design} values={asPlaceholders ? placeholders : sample} assets={assets}
              editor={{
                selected,
                onSelect: setSelected,
                onMove: (id, x, y) => updateItem(id, { x: clamp(x, -20, 100), y: clamp(y, -20, 100) }),
              }} />
          </div>
          <p className={HINT}>A4. Download PDF and Print use exactly what the preview shows, including unsaved changes.</p>
        </section>
      </div>
    </div>
  )
}

function ItemEditor({ item, update, onReplace, onDelete }: {
  item: DesignItem
  update: (p: Partial<TextItem> | Partial<ImageItem>) => void
  onReplace: (files: FileList | null) => void
  onDelete: () => void
}) {
  const num = (k: 'x' | 'y' | 'w' | 'size', label: string, min: number, max: number, step: number) => (
    <div>
      <label className={LABEL} htmlFor={`it-${k}`}>{label}</label>
      <input id={`it-${k}`} type="number" min={min} max={max} step={step} value={(item as Record<string, unknown>)[k] as number}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) update({ [k]: clamp(v, min, max) }) }} className={INPUT} />
    </div>
  )
  if (item.kind === 'image') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
        <p className="text-xs text-[#475569]">{item.name}</p>
        <label className={`${SMALL_BTN} w-fit cursor-pointer`}>
          Replace image
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={e => { onReplace(e.target.files); e.target.value = '' }} />
        </label>
        {num('w', 'Width (% of page)', 1, 100, 0.5)}
        <div className="grid grid-cols-2 gap-3">{num('x', 'From left (%)', -20, 100, 0.5)}{num('y', 'From top (%)', -20, 100, 0.5)}</div>
        <button type="button" onClick={onDelete} className="w-fit rounded-md border border-[#FCA5A5] px-2.5 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2]">Delete this image</button>
      </div>
    )
  }
  const sel = <K extends keyof TextItem>(k: K, label: string, opts: { id: string; label: string }[]) => (
    <div>
      <label className={LABEL} htmlFor={`it-${String(k)}`}>{label}</label>
      <select id={`it-${String(k)}`} value={String(item[k])} onChange={e => update({ [k]: e.target.value } as Partial<TextItem>)} className={INPUT}>
        {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
      <div>
        <label className={LABEL} htmlFor="it-text">Text</label>
        <textarea id="it-text" rows={3} value={item.text} maxLength={1000} onChange={e => update({ text: e.target.value })} className={INPUT} />
        <p className={HINT}>Press Enter for a new line. Placeholders work here too. Sinhala and Tamil are supported in both fonts.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">{num('size', 'Text size', 0.4, 15, 0.1)}{num('w', 'Width (% of page)', 2, 100, 1)}</div>
      <div className="grid grid-cols-2 gap-3">{num('x', 'From left (%)', -20, 100, 0.5)}{num('y', 'From top (%)', -20, 100, 0.5)}</div>
      {sel('font', 'Font', FONT_OPTIONS)}
      <div className="grid grid-cols-2 gap-3">
        {sel('weight', 'Weight', [{ id: '400', label: 'Regular' }, { id: '700', label: 'Bold' }])}
        {sel('align', 'Alignment', [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Right' }])}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sel('color', 'Colour', COLOR_OPTIONS)}
        {sel('line', 'Line', [{ id: 'none', label: 'None' }, { id: 'under', label: 'Accent line below' }, { id: 'over', label: 'Signature line above' }])}
      </div>
      <div className="flex gap-4 text-[13px]">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.italic} onChange={e => update({ italic: e.target.checked })} className="accent-[#022C51]" /> Italic</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.upper} onChange={e => update({ upper: e.target.checked })} className="accent-[#022C51]" /> Capital letters</label>
      </div>
      <button type="button" onClick={onDelete} className="w-fit rounded-md border border-[#FCA5A5] px-2.5 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2]">Delete this text box</button>
    </div>
  )
}
