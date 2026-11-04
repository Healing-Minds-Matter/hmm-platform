'use server'

// Certificate designs (Story 10.3). Saving uses the user's own client, so the
// database decides (RLS: certifications.design.manage; trigger: never while the
// type is retired; versions are numbered and never overwritten). Artwork is
// uploaded with the admin client into designs/{type_id}/, after the same checks.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { IMAGE_MAX_BYTES, TEMPLATE_MAX_BYTES, cleanDesign, unsafeSvg } from '@/lib/certificate-design'
import { describeCertError } from '@/lib/certificates'
import { BUCKET } from '@/lib/designs.server'

const UUID_RE = /^[0-9a-f-]{36}$/i

async function mayDesign(typeId: string): Promise<string | null> {
  if (!UUID_RE.test(typeId)) return 'Certification type not found.'
  const supabase = await createClient()
  const [{ data: allowed }, { data: type }] = await Promise.all([
    supabase.rpc('cert_can', { p_permission: 'certifications.design.manage' }),
    supabase.from('certification_type_statuses').select('status').eq('id', typeId).maybeSingle(),
  ])
  if (allowed !== true) return 'Only Super Admins can design certificates.'
  if (!type) return 'Certification type not found.'
  if (type.status === 'retired') return 'This certification type is retired; its design can’t be created or edited until it is reactivated.'
  return null
}

export type AssetUpload = { path: string; url: string; name: string } | { error: string }

// kind 'template': the whole page (PNG/JPG, 5 MB). kind 'image': a logo, signature, seal or photo (PNG/JPG/SVG, 2 MB).
export async function uploadDesignAssetAction(formData: FormData): Promise<AssetUpload> {
  const typeId = String(formData.get('type_id') ?? '')
  const kind = formData.get('kind') === 'template' ? 'template' : 'image'
  const file = formData.get('file')
  const denied = await mayDesign(typeId)
  if (denied) return { error: denied }
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file.' }

  const types: Record<string, string> = kind === 'template'
    ? { 'image/png': 'png', 'image/jpeg': 'jpg' }
    : { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }
  const ext = types[file.type]
  if (!ext) return { error: kind === 'template' ? 'The template must be a PNG or JPG.' : 'Images must be PNG, JPG or SVG.' }
  const max = kind === 'template' ? TEMPLATE_MAX_BYTES : IMAGE_MAX_BYTES
  if (file.size > max) return { error: kind === 'template' ? 'The template must be 5 MB or less.' : `${file.name} is larger than 2 MB.` }
  const buf = Buffer.from(await file.arrayBuffer())
  if (ext === 'svg' && unsafeSvg(buf.toString('utf8'))) return { error: `${file.name} contains scripts or links, which aren’t allowed in certificate images.` }

  const path = `designs/${typeId}/${crypto.randomUUID()}.${ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type })
  if (error) return { error: (error.message ?? '').includes('mime') ? 'That file type isn’t allowed yet. Run the latest certification migration, then try again.' : 'The file couldn’t be uploaded. Please try again.' }
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600)
  return { path, url: data?.signedUrl ?? '', name: file.name.slice(0, 120) }
}

export type SaveDesignResult = { version: number } | { error: string }

export async function saveDesignAction(typeId: string, input: unknown): Promise<SaveDesignResult> {
  const denied = await mayDesign(typeId)
  if (denied) return { error: denied }
  const cleaned = cleanDesign(input, typeId)
  if ('error' in cleaned) return { error: cleaned.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('certification_designs')
    .insert({ type_id: typeId, design: cleaned.design }).select('version').single()
  if (error || !data) return { error: describeCertError(error) }
  revalidatePath(`/super-admin/certifications/${typeId}`)
  revalidatePath(`/super-admin/certifications/${typeId}/design`)
  return { version: data.version as number }
}
