// Download PDF / Print for the designer and saved versions (Story 10.3 Sc09,
// 10.4 Sc03): an A4 PDF of exactly what the preview shows, with a sample person
// or the placeholders themselves.
//   POST { design, placeholders }  the designer's current (unsaved) design
//   GET  ?version=N&placeholders=1  a saved version
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadType } from '@/lib/certifications.server'
import { cleanDesign, placeholderValues, sampleValues, type Design } from '@/lib/certificate-design'
import { renderCertificatePdf } from '@/lib/certificate-pdf.server'
import { assetLoader } from '@/lib/designs.server'

export const runtime = 'nodejs'

async function respond(typeId: string, design: unknown, asPlaceholders: boolean, filename: string) {
  const supabase = await createClient()
  const [{ data: allowed }, type] = await Promise.all([
    supabase.rpc('cert_can', { p_permission: 'certifications.design.manage' }),
    loadType(supabase, typeId),
  ])
  if (allowed !== true) return NextResponse.json({ error: 'Only Super Admins can design certificates.' }, { status: 403 })
  if (!type) return NextResponse.json({ error: 'Certification type not found.' }, { status: 404 })
  const cleaned = cleanDesign(design, typeId)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const values = asPlaceholders ? placeholderValues(true) : sampleValues(type)
  const pdf = await renderCertificatePdf(cleaned.design, values, assetLoader())
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { design?: Design; placeholders?: boolean } | null
  return respond(id, body?.design, body?.placeholders === true, 'certificate-design.pdf')
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const version = Number(url.searchParams.get('version'))
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'Choose a version.' }, { status: 400 })
  const supabase = await createClient()
  const { data } = await supabase.from('certification_designs').select('design').eq('type_id', id).eq('version', version).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Version not found.' }, { status: 404 })
  return respond(id, data.design, url.searchParams.get('placeholders') === '1', `certificate-design-v${version}.pdf`)
}
