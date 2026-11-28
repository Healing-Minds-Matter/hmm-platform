import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { unguessablePassword } from '@/lib/unguessable-password.server'
import { sendTemporaryPasswordResetNotice, type SendResult } from '@/lib/send-email'
import { hasSignedIn, issueAccountSetupInvite, revokeUserSessions } from '@/lib/account-setup.server'

// Fix B: accounts still on a temporary password were only flagged "must
// change password" (Review F3). Whoever created them still knows that
// password. This retires every such password (run by a Super Admin from
// scripts/reset-temporary-password-accounts.ts):
//   - never signed in → a new set-password link (issueAccountSetupInvite,
//     which also replaces the password with a random one nobody sees);
//   - signed in before → random password, every session ended, and a notice
//     email telling them to use Forgot password;
//   - made-up address (example.com, .test, ...) → random password and every
//     session ended, but NO email (it could only bounce). A Super Admin can
//     also switch any approved line to this in the approval file (e.g. for a
//     real inbox that isn't the person's).
//
// "Still on a temporary password" = profiles.must_change_password is true.
// New accounts are created with it false; the database clears it whenever
// the password changes, so an account this has handled drops off the list
// (re-running is safe). No password is ever returned, printed or logged here.

export const AUDIT_ACTION = 'account.temporary_password_retired'

export const ACTIONS = {
  sendSetPasswordLink: 'send_set_password_link',
  replacePasswordAndNotify: 'replace_password_and_notify',
  replacePasswordNoEmail: 'replace_password_no_email',
  skipSuperAdmin: 'skip_super_admin',
  skipDeactivated: 'skip_deactivated',
} as const
export type PlannedAction = (typeof ACTIONS)[keyof typeof ACTIONS]
const RUNNABLE: ReadonlySet<PlannedAction> = new Set([
  ACTIONS.sendSetPasswordLink, ACTIONS.replacePasswordAndNotify, ACTIONS.replacePasswordNoEmail,
])
const SENDS_EMAIL: ReadonlySet<PlannedAction> = new Set([ACTIONS.sendSetPasswordLink, ACTIONS.replacePasswordAndNotify])

// Reserved for examples and testing (RFC 2606 / 6761): no real inbox exists.
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org'])
const RESERVED_ENDINGS = ['.example', '.test', '.invalid', '.localhost']

/** True when an email to this address can only bounce (made-up or missing). */
export function isUndeliverableEmail(email: string | null | undefined): boolean {
  const domain = (email ?? '').trim().toLowerCase().split('@')[1]
  if (!domain) return true
  return RESERVED_DOMAINS.has(domain) || RESERVED_ENDINGS.some(end => domain.endsWith(end))
}

export function sendsEmail(action: PlannedAction): boolean {
  return SENDS_EMAIL.has(action)
}

export type FlaggedProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  club_id: string | null
  is_active: boolean
}

export type PlanRow = {
  id: string
  email: string
  fullName: string
  role: string
  club: string
  /** 'unknown' = couldn't be checked; treated as signed in (fail closed). */
  signedIn: 'never' | 'yes' | 'unknown'
  action: PlannedAction
}

export type Outcome =
  | 'link_sent'
  | 'password_replaced_notice_sent'
  | 'password_replaced_notice_failed'
  | 'password_replaced_sessions_not_ended'
  | 'password_replaced_no_email'
  | 'failed'
  | 'skipped_not_on_list'
  | 'skipped_changed_since_dry_run'

export type RunResult = { id: string; email: string; action: PlannedAction | null; outcome: Outcome; note?: string }

export type ResetDeps = {
  listFlaggedProfiles(): Promise<FlaggedProfile[]>
  clubNames(ids: string[]): Promise<Map<string, string>>
  hasSignedIn(userId: string): Promise<boolean>
  getActor(userId: string): Promise<{ role: string; is_active: boolean } | null>
  issueSetupLink(userId: string, actorId: string): Promise<{ ok: true } | { error: string }>
  /** Replaces the password with a random one that is never returned. */
  replacePassword(userId: string): Promise<boolean>
  revokeSessions(userId: string): Promise<boolean>
  authEmail(userId: string): Promise<string | null>
  sendNotice(params: { to: string; fullName: string; role: string }): Promise<SendResult>
  audit(entry: { actorId: string; userId: string; details: Record<string, unknown> }): Promise<void>
  sleep(ms: number): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reads only: who is still on a temporary password, and what would be done. */
export async function buildPlan(deps: ResetDeps): Promise<PlanRow[]> {
  const profiles = await deps.listFlaggedProfiles()
  const clubIds = [...new Set(profiles.map(p => p.club_id).filter((c): c is string => !!c))]
  const clubs = clubIds.length ? await deps.clubNames(clubIds) : new Map<string, string>()

  const rows: PlanRow[] = []
  for (const p of profiles) {
    let signedIn: PlanRow['signedIn']
    try {
      signedIn = (await deps.hasSignedIn(p.id)) ? 'yes' : 'never'
    } catch {
      signedIn = 'unknown'
    }
    const action: PlannedAction =
      p.role === 'super_admin' ? ACTIONS.skipSuperAdmin
        : !p.is_active ? ACTIONS.skipDeactivated
          : isUndeliverableEmail(p.email) ? ACTIONS.replacePasswordNoEmail
            : signedIn === 'never' ? ACTIONS.sendSetPasswordLink
              : ACTIONS.replacePasswordAndNotify
    rows.push({
      id: p.id,
      email: p.email ?? '',
      fullName: p.full_name ?? '',
      role: p.role,
      club: p.club_id ? clubs.get(p.club_id) ?? '(unknown club)' : '-',
      signedIn,
      action,
    })
  }
  // Runnable first, then skipped; stable by email inside each group.
  return rows.sort((a, b) =>
    Number(!RUNNABLE.has(a.action)) - Number(!RUNNABLE.has(b.action)) || a.email.localeCompare(b.email))
}

export function isRunnable(action: PlannedAction): boolean {
  return RUNNABLE.has(action)
}

/** The approval file the dry run writes: one "<account id> <action>" per line. */
export function formatApprovalFile(plan: PlanRow[], createdAt: Date): string {
  const runnable = plan.filter(r => isRunnable(r.action))
  return [
    `# Fix B dry run, ${createdAt.toISOString()}: ${runnable.length} account(s).`,
    '# Delete the line of any account you do NOT approve. Lines starting with # are ignored.',
    `# To retire a password WITHOUT sending an email, change that line's action to ${ACTIONS.replacePasswordNoEmail}.`,
    ...runnable.map(r => `${r.id} ${r.action}  # ${r.email} (${r.role}, ${r.club})`),
    '',
  ].join('\n')
}

/** Strict: any line that isn't "<uuid> <runnable action>" (or a comment) is refused. */
export function parseApprovalFile(text: string): Map<string, PlannedAction> {
  const approved = new Map<string, PlannedAction>()
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const [id, action, ...rest] = line.split(/\s+/)
    if (!UUID.test(id) || !action || rest.length || !RUNNABLE.has(action as PlannedAction)) {
      throw new Error(`Approval file line ${i + 1} is not "<account id> <action>".`)
    }
    if (approved.has(id)) throw new Error(`Approval file line ${i + 1}: account listed twice.`)
    approved.set(id, action as PlannedAction)
  })
  return approved
}

export type LivePrepared = {
  /** Accounts that will be handled, in order (after --limit). */
  batch: PlanRow[]
  /** Approved but no longer on a temporary password (e.g. already done). */
  notOnList: string[]
  /** Approved, but the planned action changed since the dry run (or is now a skip). */
  changed: PlanRow[]
  /** On the list now but not approved: left untouched. */
  notApproved: PlanRow[]
  /** Approved and matching, but beyond --limit: left for the next run. */
  deferred: PlanRow[]
}

/** Re-reads the list now and keeps only accounts approved with the same action. Changes nothing. */
export async function prepareLiveRun(
  approved: Map<string, PlannedAction>, limit: number, deps: ResetDeps,
): Promise<LivePrepared> {
  const plan = await buildPlan(deps)
  const byId = new Map(plan.map(r => [r.id, r]))
  const matching: PlanRow[] = []
  const changed: PlanRow[] = []
  const notOnList: string[] = []
  for (const [id, action] of approved) {
    const row = byId.get(id)
    if (!row) notOnList.push(id)
    else if (row.action === action) matching.push(row)
    // Switching an approved account to "no email" is always allowed (it only sends less).
    else if (action === ACTIONS.replacePasswordNoEmail && isRunnable(row.action)) matching.push({ ...row, action })
    else changed.push(row)
  }
  const notApproved = plan.filter(r => isRunnable(r.action) && !approved.has(r.id))
  return { batch: matching.slice(0, limit), deferred: matching.slice(limit), changed, notOnList, notApproved }
}

/** Does the live run. One account failing never stops the rest. */
export async function runLive(params: {
  batch: PlanRow[]
  actorId: string
  delayMs: number
  deps: ResetDeps
  onResult?: (result: RunResult, index: number) => void
}): Promise<RunResult[]> {
  const { batch, actorId, delayMs, deps } = params
  const actor = await deps.getActor(actorId)
  if (!actor || actor.role !== 'super_admin' || !actor.is_active) {
    throw new Error('--actor must be an active Super Admin account.')
  }

  const results: RunResult[] = []
  for (const [i, row] of batch.entries()) {
    if (i > 0 && delayMs > 0) await deps.sleep(delayMs)
    let result: RunResult
    try {
      result = await handleOne(row, actorId, deps)
    } catch {
      result = { id: row.id, email: row.email, action: row.action, outcome: 'failed', note: 'unexpected error' }
    }
    try {
      await deps.audit({
        actorId,
        userId: row.id,
        details: { action: row.action, outcome: result.outcome, ...(result.note ? { note: result.note } : {}) },
      })
    } catch {
      result.note = [result.note, 'audit log entry not written'].filter(Boolean).join('; ')
    }
    results.push(result)
    params.onResult?.(result, i)
  }
  return results
}

async function handleOne(row: PlanRow, actorId: string, deps: ResetDeps): Promise<RunResult> {
  const base = { id: row.id, email: row.email, action: row.action }

  if (row.action === ACTIONS.sendSetPasswordLink) {
    const res = await deps.issueSetupLink(row.id, actorId)
    return 'ok' in res ? { ...base, outcome: 'link_sent' } : { ...base, outcome: 'failed', note: res.error }
  }

  // Kill the temporary password first, then sessions, then (unless "no email") tell them.
  if (!(await deps.replacePassword(row.id))) {
    return { ...base, outcome: 'failed', note: 'password could not be replaced (nothing changed)' }
  }
  const sessionsEnded = await deps.revokeSessions(row.id)
  if (row.action === ACTIONS.replacePasswordNoEmail) {
    return { ...base, outcome: sessionsEnded ? 'password_replaced_no_email' : 'password_replaced_sessions_not_ended' }
  }
  const to = (await deps.authEmail(row.id)) ?? row.email
  const sent = to ? await deps.sendNotice({ to, fullName: row.fullName, role: row.role }) : { error: 'no email address' }
  if (!sessionsEnded) return { ...base, outcome: 'password_replaced_sessions_not_ended', note: sent.error ? 'notice email also failed' : undefined }
  if (sent.error) return { ...base, outcome: 'password_replaced_notice_failed', note: sent.reason ?? sent.status?.toString() }
  return { ...base, outcome: 'password_replaced_notice_sent' }
}

/** The real database and email (service-role key). Only the CLI uses this. */
export function realDeps(): ResetDeps {
  const admin = createAdminClient()
  return {
    async listFlaggedProfiles() {
      const all: FlaggedProfile[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from('profiles')
          .select('id, email, full_name, role, club_id, is_active')
          .eq('must_change_password', true)
          .order('id')
          .range(from, from + 999)
        if (error) throw new Error(`Could not read accounts (${error.code ?? 'unknown'}).`)
        all.push(...((data ?? []) as FlaggedProfile[]))
        if (!data || data.length < 1000) return all
      }
    },
    async clubNames(ids) {
      const { data, error } = await admin.from('clubs').select('id, name').in('id', ids)
      if (error) throw new Error(`Could not read clubs (${error.code ?? 'unknown'}).`)
      return new Map((data ?? []).map(c => [c.id as string, c.name as string]))
    },
    hasSignedIn,
    async getActor(userId) {
      const { data } = await admin.from('profiles').select('role, is_active').eq('id', userId).maybeSingle()
      return data ?? null
    },
    issueSetupLink: (userId, actorId) => issueAccountSetupInvite({ userId, requestedBy: actorId }),
    async replacePassword(userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: unguessablePassword() })
      return !error
    },
    revokeSessions: revokeUserSessions,
    async authEmail(userId) {
      const { data } = await admin.auth.admin.getUserById(userId)
      return data?.user?.email ?? null
    },
    sendNotice: sendTemporaryPasswordResetNotice,
    async audit({ actorId, userId, details }) {
      // Written directly (not writeAuditLog) so a failed write is reported, not silently lost.
      const { error } = await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: AUDIT_ACTION,
        entity_type: 'profile',
        entity_id: userId,
        details,
      })
      if (error) throw new Error('audit log write failed')
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
}
