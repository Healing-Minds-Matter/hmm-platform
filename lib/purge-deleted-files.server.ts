import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'

// Decision 2 (after Security Finding 6): removes the stored files of resources
// that were soft-deleted more than `olderThanDays` days ago. Trusted server
// code only (service-role key) — called by the cron route after its secret
// check. The resource rows are kept (soft delete), marked file_purged_at.

const BUCKET = 'resources'
const BATCH = 100
export const DEFAULT_PURGE_AFTER_DAYS = 30

export function purgeAfterDays(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : DEFAULT_PURGE_AFTER_DAYS
}

const isStoredPath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !/^https?:\/\//i.test(v)

export async function purgeDeletedResourceFiles(olderThanDays: number, now: Date = new Date()) {
  const admin = createAdminClient()
  const cutoff = new Date(now.getTime() - olderThanDays * 864e5).toISOString()

  const { data, error } = await admin
    .from('resources')
    .select('id, content_url, deleted_at')
    .lt('deleted_at', cutoff)
    .is('file_purged_at', null)
    .limit(1000)
  if (error) throw new Error(`Couldn't list deleted resources: ${error.message}`)

  const due = (data ?? []) as { id: string; content_url: string | null }[]
  const purgedIds: string[] = []
  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH)
    const paths = batch.map(r => r.content_url).filter(isStoredPath)
    if (paths.length) {
      const { error: rmError } = await admin.storage.from(BUCKET).remove(paths)
      if (rmError) throw new Error(`Couldn't remove files: ${rmError.message}`)
    }
    // External links have no file; files already gone count as removed.
    const ids = batch.map(r => r.id)
    const { error: markError } = await admin.from('resources').update({ file_purged_at: now.toISOString() }).in('id', ids)
    if (markError) throw new Error(`Couldn't mark resources as purged: ${markError.message}`)
    purgedIds.push(...ids)
  }

  if (purgedIds.length) {
    await writeAuditLog({
      action: 'resource.files_purged',
      entityType: 'resource',
      details: { count: purgedIds.length, resource_ids: purgedIds, older_than_days: olderThanDays },
    })
  }
  return { purged: purgedIds.length, olderThanDays }
}
