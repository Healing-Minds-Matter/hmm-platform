import 'server-only'
// Certificate designs (Stories 10.3, 10.4): versions, artwork links and PDFs.
// Design rows are read with the user's own client (RLS); artwork lives in the
// private certification-files bucket under designs/{type_id}/ and is only ever
// handed out as short-lived signed links made here, after the page has checked
// the viewer may see it.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanDesign, designAssets, type Design } from '@/lib/certificate-design'
import type { AssetLoader } from '@/lib/certificate-pdf.server'

type ServerClient = Awaited<ReturnType<typeof createClient>>
export const BUCKET = 'certification-files'

export type DesignVersion = {
  version: number
  design: Design
  created_at: string
  created_by_name: string | null
  issued: number               // certificates issued with this version (not removed)
}

export async function loadDesignVersions(supabase: ServerClient, typeId: string): Promise<DesignVersion[]> {
  const [{ data }, { data: certs }] = await Promise.all([
    supabase.from('certification_designs')
      .select('version, design, created_at, created_by:profiles!certification_designs_created_by_fkey(full_name)')
      .eq('type_id', typeId).order('version', { ascending: false }),
    supabase.from('certificates').select('design_version').eq('type_id', typeId).is('removed_at', null).not('design_version', 'is', null),
  ])
  const issued = new Map<number, number>()
  for (const c of certs ?? []) issued.set(c.design_version as number, (issued.get(c.design_version as number) ?? 0) + 1)
  return (data ?? []).map(r => {
    const cleaned = cleanDesign(r.design, typeId)
    const by = (Array.isArray(r.created_by) ? r.created_by[0] : r.created_by) as { full_name?: string } | null
    return {
      version: r.version as number,
      // Saved designs were checked on save; this only guards against a hand-edited row.
      design: 'design' in cleaned ? cleaned.design : (r.design as Design),
      created_at: r.created_at as string,
      created_by_name: by?.full_name ?? null,
      issued: issued.get(r.version as number) ?? 0,
    }
  })
}

// Signed links (1 hour) for the artwork of the given designs.
export async function signedAssetUrls(designs: Design[]): Promise<Record<string, string>> {
  const paths = [...new Set(designs.flatMap(designAssets))]
  if (!paths.length) return {}
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(paths, 3600)
  const out: Record<string, string> = {}
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  return out
}

// Reads artwork for the PDF renderer, once per path.
export function assetLoader(): AssetLoader {
  const cache = new Map<string, Promise<Buffer | null>>()
  const admin = createAdminClient()
  return path => {
    if (!cache.has(path)) {
      cache.set(path, admin.storage.from(BUCKET).download(path).then(async ({ data }) => (data ? Buffer.from(await data.arrayBuffer()) : null)))
    }
    return cache.get(path)!
  }
}
