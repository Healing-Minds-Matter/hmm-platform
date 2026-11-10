import { purgeAfterDays, purgeDeletedResourceFiles } from '@/lib/purge-deleted-files.server'

// Daily clean-up of deleted resources' files (decision 2, after Security
// Finding 6). Called by Vercel Cron (vercel.json), which sends
// "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET set, nothing runs.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await purgeDeletedResourceFiles(purgeAfterDays(process.env.PURGE_DELETED_FILES_AFTER_DAYS))
    return Response.json(result)
  } catch (error) {
    console.error('[purge-deleted-files]', error instanceof Error ? error.message : error)
    return new Response('Clean-up failed', { status: 500 })
  }
}
