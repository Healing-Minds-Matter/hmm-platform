import { describe, expect, it } from 'vitest'
import { cleanDesign, defaultDesign, designAssets, fillPlaceholders, sampleValues, splitRuns, unsafeSvg } from '@/lib/certificate-design'

const TYPE = '11111111-2222-3333-4444-555555555555'
const asset = (f: string) => `designs/${TYPE}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.${f}`

describe('placeholders', () => {
  it('fills known placeholders and leaves others', () => {
    const v = sampleValues({ name: 'QPR', code: 'QPR', issuing_body: null, validity_value: 3, validity_unit: 'years' })
    expect(fillPlaceholders('{full_name} – {expiry_date} – {certificate_number} – {issuing_body} {unknown}', v))
      .toBe('Nadeesha Perera – 12 Mar 2029 – HMM-QPR-2026-000041 – Healing Minds Matter {unknown}')
  })
  it('a lifetime type prints Lifetime', () => {
    expect(sampleValues({ name: 'X', code: 'X', issuing_body: 'Org', validity_value: null, validity_unit: null }).expiry_date).toBe('Lifetime')
  })
})

describe('splitRuns', () => {
  it('splits Latin, Sinhala and Tamil, keeping joiners and spaces with their run', () => {
    expect(splitRuns('Mixed: ශ්‍රී and தமிழ்')).toEqual([
      { script: 'latin', text: 'Mixed: ' }, { script: 'sinhala', text: 'ශ්‍රී ' }, { script: 'latin', text: 'and ' }, { script: 'tamil', text: 'தமிழ்' },
    ])
    expect(splitRuns('')).toEqual([])
  })
})

describe('cleanDesign', () => {
  it('keeps a valid design', () => {
    const d = defaultDesign()
    const out = cleanDesign(d, TYPE)
    expect('design' in out && out.design.items.length).toBe(d.items.length)
  })
  it('clamps numbers, fixes bad values and drops images that belong elsewhere', () => {
    const out = cleanDesign({
      source: 'layout', layout: 'nope', c1: 'red', items: [
        { id: 'a', kind: 'text', text: 'Hi', x: 500, size: -3, font: 'comic', color: 'pink' },
        { id: 'a', kind: 'image', src: asset('png'), x: 1, y: 1, w: 10, aspect: 0.5 },
        { id: 'b', kind: 'image', src: 'designs/other-type/x.png', x: 1, y: 1, w: 10 },
        { id: 'c', kind: 'image', src: 'https://evil.example/x.png' },
      ],
    }, TYPE)
    if (!('design' in out)) throw new Error(out.error)
    expect(out.design.layout).toBe('classic')
    expect(out.design.c1).toBe('#012C51')
    expect(out.design.items).toHaveLength(2)
    const [t, img] = out.design.items
    expect(t).toMatchObject({ kind: 'text', x: 100, size: 0.4, font: 'serif', color: 'dark' })
    expect(img.kind).toBe('image')
    expect(img.id).not.toBe('a')            // duplicate ids are renamed
  })
  it('a template needs its artwork, and the artwork can’t be an SVG', () => {
    expect(cleanDesign({ source: 'template', items: [] }, TYPE)).toEqual({ error: 'Upload your template artwork, or choose a built-in layout.' })
    expect(cleanDesign({ source: 'template', bg: asset('svg'), items: [] }, TYPE)).toEqual({ error: 'Upload your template artwork, or choose a built-in layout.' })
    const ok = cleanDesign({ source: 'template', bg: asset('jpg'), orient: 'portrait', items: [{ kind: 'image', src: asset('svg'), w: 5 }] }, TYPE)
    if (!('design' in ok)) throw new Error(ok.error)
    expect(designAssets(ok.design)).toEqual([asset('jpg'), asset('svg')])
  })
  it('refuses too many items and junk', () => {
    expect(cleanDesign({ items: Array.from({ length: 61 }, () => ({ kind: 'text' })) }, TYPE)).toHaveProperty('error')
    expect(cleanDesign(null, TYPE)).toHaveProperty('error')
  })
})

describe('unsafeSvg', () => {
  it('flags scripts and event handlers', () => {
    expect(unsafeSvg('<svg><script>alert(1)</script></svg>')).toBe(true)
    expect(unsafeSvg('<svg onload="x()"></svg>')).toBe(true)
    expect(unsafeSvg('<svg viewBox="0 0 10 10"><circle r="5"/></svg>')).toBe(false)
  })
})
