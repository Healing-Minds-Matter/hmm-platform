import type { PermissionActionState } from '@/actions/permissions'

export const OFFLINE_MESSAGE = 'Couldn’t reach the server. Check your connection and try again.'

/**
 * Fix L: runs the save and says whether it worked. Returns null when saved,
 * or the message to show (the switch then flips back). A thrown error (no
 * connection, server down) counts as a failure too.
 */
export async function saveRoleDefault(
  send: (fd: FormData) => Promise<PermissionActionState>,
  fd: FormData,
): Promise<string | null> {
  try {
    const result = await send(fd)
    return result?.error ?? null
  } catch {
    return OFFLINE_MESSAGE
  }
}
