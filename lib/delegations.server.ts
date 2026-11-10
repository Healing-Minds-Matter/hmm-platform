import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'

// Moved out of actions/permissions.ts (Security Finding 5): every export of a
// 'use server' file is a public endpoint, and this one took the audit actor
// as an argument and used the service-role key with no sign-in check, so
// anyone could end delegations and write audit entries in someone else's
// name. As a plain server-only module it can only be called by the server
// actions that deactivate people, after their own guards, with the real caller.

/**
 * Called from deactivation flows (champions.ts, clubs.ts cascade) so any
 * delegation where the deactivated user is the delegator ends immediately
 * and gets an audit trail — the access itself already vanishes on the next
 * live check via v_active_role_delegations' is_active predicate; this only
 * concerns the recorded end-reason and audit log.
 */
export async function endDelegationsForDeactivatedUser(delegatorUserId: string, actorId: string) {
  const admin = createAdminClient()

  const { data: ended } = await admin
    .from('role_delegations')
    .update({ ended_early_at: new Date().toISOString(), ended_reason: 'delegator_deactivated' })
    .eq('delegator_id', delegatorUserId)
    .is('ended_early_at', null)
    .gt('ends_at', new Date().toISOString())
    .select('id, delegate_id')

  if (!ended || ended.length === 0) return

  await writeAuditLog({
    actorId,
    action: 'role_delegation.ended_delegator_deactivated',
    entityType: 'profile',
    entityId: delegatorUserId,
    details: { ended_delegation_ids: ended.map(d => d.id), delegate_ids: ended.map(d => d.delegate_id) },
  })
}
