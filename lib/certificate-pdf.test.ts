import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { defaultDesign, sampleValues, type Design } from '@/lib/certificate-design'
import { renderCertificatePdf } from '@/lib/certificate-pdf.server'

const SEAL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#F4AC1E"/><text x="50" y="57" font-size="22" text-anchor="middle" fill="#012C51">HMM</text></svg>'
const values = sampleValues({ name: 'QPR Gatekeeper Training', code: 'QPR', issuing_body: 'QPR Institute', validity_value: 3, validity_unit: 'years' })

function sample(layout: Design['layout']): Design {
  const d = defaultDesign()
  d.layout = layout
  d.items.push(
    { id: 'si', kind: 'text', text: 'සහතිකය – ශ්‍රී ලංකාව', x: 10, y: 24, w: 80, size: 1.8, font: 'sans', weight: '700', italic: false, upper: false, align: 'center', color: 'c1', line: 'none' },
    { id: 'ta', kind: 'text', text: 'சான்றிதழ் – {full_name}', x: 10, y: 64, w: 80, size: 1.4, font: 'serif', weight: '400', italic: true, upper: false, align: 'center', color: 'dark', line: 'none' },
    { id: 'seal', kind: 'image', src: 'designs/x/seal.svg', name: 'seal.svg', x: 46, y: 68, w: 8, aspect: 1 },
  )
  return d
}

describe('renderCertificatePdf', () => {
  it.each(['classic', 'modern', 'portrait'] as const)('draws the %s layout with Sinhala, Tamil and an SVG image', async layout => {
    const pdf = await renderCertificatePdf(sample(layout), values, async p => (p.endsWith('.svg') ? Buffer.from(SEAL) : null))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(5000)
    // Set CERT_PDF_OUT to a folder to look at the results.
    if (process.env.CERT_PDF_OUT) fs.writeFileSync(`${process.env.CERT_PDF_OUT}/sample-${layout}.pdf`, pdf)
  })
})
