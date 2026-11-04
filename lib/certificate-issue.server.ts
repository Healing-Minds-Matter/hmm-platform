import 'server-only'
// Makes (or re-makes) an issued certificate's PDF (Stories 10.5 Sc04, 10.6 Sc03).
// Call only after the user's own client has saved the certificate with its
// design version: the database checked the permissions then and gave it its
// number. This step only draws and stores the file, so it uses the admin
// client; the file goes to pdfs/{holder_id}/{certificate_id}/, and the
// certificate's pdf_path is set as a system change (no event, no notification —
// the save itself already recorded and announced it).

import { createAdminClient } from '@/lib/supabase/admin'
import { certificateValues, cleanDesign } from '@/lib/certificate-design'
import { renderCertificatePdf } from '@/lib/certificate-pdf.server'
import { BUCKET, assetLoader } from '@/lib/designs.server'

export async function issueCertificatePdf(certificateId: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()
  const { data: cert } = await admin.from('certificates')
    .select('id, holder_id, type_id, achieved_on, expires_on, certificate_number, design_version, pdf_path, holder:profiles!certificates_holder_id_fkey(full_name, clubs!profiles_club_id_fkey(name)), type:certification_types(name, code, issuing_body)')
    .eq('id', certificateId).maybeSingle()
  if (!cert || cert.design_version == null || !cert.certificate_number) return { error: 'This certificate has no digital design to print.' }
  const { data: row } = await admin.from('certification_designs').select('design').eq('type_id', cert.type_id).eq('version', cert.design_version).maybeSingle()
  const cleaned = row ? cleanDesign(row.design, cert.type_id) : null
  if (!cleaned || 'error' in cleaned) return { error: 'The certificate design couldn’t be read.' }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  type Holder = { full_name: string; clubs: { name: string } | { name: string }[] | null }
  const holder = one(cert.holder as unknown as Holder | Holder[] | null)
  type TypeRow = { name: string; code: string; issuing_body: string | null }
  const type = one(cert.type as unknown as TypeRow | TypeRow[] | null)
  if (!holder || !type) return { error: 'The certificate’s holder or type couldn’t be read.' }

  const values = certificateValues(type, {
    fullName: holder.full_name,
    clubName: one(holder.clubs)?.name ?? null,
    achievedOn: cert.achieved_on,
    expiresOn: cert.expires_on,
    certificateNumber: cert.certificate_number,
  })
  let pdf: Buffer
  try {
    pdf = await renderCertificatePdf(cleaned.design, values, assetLoader())
  } catch {
    return { error: 'The certificate PDF couldn’t be drawn.' }
  }
  const path = `pdfs/${cert.holder_id}/${cert.id}/${crypto.randomUUID()}.pdf`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf' })
  if (upErr) return { error: 'The certificate PDF couldn’t be stored.' }
  const { error: setErr } = await admin.from('certificates').update({ pdf_path: path }).eq('id', cert.id)
  if (setErr) {
    await admin.storage.from(BUCKET).remove([path])
    return { error: 'The certificate PDF couldn’t be linked to the certificate.' }
  }
  // A re-issue replaces the file; the certificate number and its history stay.
  if (cert.pdf_path && cert.pdf_path !== path) await admin.storage.from(BUCKET).remove([cert.pdf_path])
  return { ok: true }
}

// The current design version of each type (types without a design are left out).
export async function currentDesignVersions(typeIds: string[]): Promise<Record<string, number>> {
  if (!typeIds.length) return {}
  const { data } = await createAdminClient().from('certification_designs').select('type_id, version').in('type_id', typeIds)
  const out: Record<string, number> = {}
  for (const r of data ?? []) out[r.type_id] = Math.max(out[r.type_id] ?? 0, r.version as number)
  return out
}
