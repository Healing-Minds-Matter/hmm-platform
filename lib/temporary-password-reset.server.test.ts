import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix B: retiring temporary passwords. Everything here runs against fakes:
// no database, no SendGrid. The real admin client is replaced by a spy, and
// the real email sender by a mock, so a slip can never reach live.

const h = vi.hoisted(() => ({
  updateUserById: vi.fn<(id: string, attrs: { password: string }) => Promise<{ error: null | { message: string } }>>(
    async () => ({ error: null })),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: h.updateUserById, getUserById: vi.fn() } },
    from: () => { throw new Error('no database in tests') },
    rpc: () => { throw new Error('no database in tests') },
  }),
}))
vi.mock('@/lib/send-email', () => ({ sendTemporaryPasswordResetNotice: vi.fn(async () => ({})) }))
vi.mock('@/lib/account-setup.server', () => ({
  hasSignedIn: vi.fn(), issueAccountSetupInvite: vi.fn(), revokeUserSessions: vi.fn(),
}))

import {
  ACTIONS, AUDIT_ACTION, buildPlan, formatApprovalFile, parseApprovalFile, prepareLiveRun, realDeps, runLive,
  type FlaggedProfile, type PlannedAction, type ResetDeps,
} from '@/lib/temporary-password-reset.server'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ACTOR = id(99)
const NEVER = id(1) // Gatekeeper, never signed in
const SIGNED = id(2) // Champion, has signed in
const UNKNOWN = id(3) // sign-in check fails
const SUPER = id(4)
const INACTIVE = id(5)

function profiles(): FlaggedProfile[] {
  return [
    { id: SIGNED, email: 'zz-champ@example.com', full_name: 'ZZ Champ', role: 'champion', club_id: 'c1', is_active: true },
    { id: NEVER, email: 'zz-gk@example.com', full_name: 'ZZ Gate', role: 'gatekeeper', club_id: 'c1', is_active: true },
    { id: UNKNOWN, email: 'zz-unknown@example.com', full_name: 'ZZ Unknown', role: 'gatekeeper', club_id: null, is_active: true },
    { id: SUPER, email: 'zz-sa@example.com', full_name: 'ZZ Admin', role: 'super_admin', club_id: null, is_active: true },
    { id: INACTIVE, email: 'zz-off@example.com', full_name: 'ZZ Off', role: 'gatekeeper', club_id: 'c1', is_active: false },
  ]
}

let calls: string[]
let deps: ResetDeps & { [K in keyof ResetDeps]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  calls = []
  h.updateUserById.mockClear()
  const flagged = profiles()
  deps = {
    listFlaggedProfiles: vi.fn(async () => flagged),
    clubNames: vi.fn(async () => new Map([['c1', 'ZZ Club']])),
    hasSignedIn: vi.fn(async (u: string) => {
      if (u === UNKNOWN) throw new Error('rpc down')
      return u === SIGNED
    }),
    getActor: vi.fn(async (u: string) => (u === ACTOR ? { role: 'super_admin', is_active: true } : { role: 'champion', is_active: true })),
    issueSetupLink: vi.fn(async (u: string) => { calls.push(`link:${u}`); return { ok: true as const } }),
    replacePassword: vi.fn(async (u: string) => { calls.push(`password:${u}`); return true }),
    revokeSessions: vi.fn(async (u: string) => { calls.push(`sessions:${u}`); return true }),
    authEmail: vi.fn(async () => 'auth-address@example.com'),
    sendNotice: vi.fn(async (p: { to: string }) => { calls.push(`notice:${p.to}`); return {} }),
    audit: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
  } as never
})

const WRITES = ['issueSetupLink', 'replacePassword', 'revokeSessions', 'sendNotice', 'audit'] as const

describe('buildPlan (dry run)', () => {
  it('lists each account with role, club, sign-in state and planned action', async () => {
    const plan = await buildPlan(deps)
    const byId = Object.fromEntries(plan.map(r => [r.id, r]))
    expect(byId[NEVER]).toMatchObject({ email: 'zz-gk@example.com', role: 'gatekeeper', club: 'ZZ Club', signedIn: 'never', action: ACTIONS.sendSetPasswordLink })
    expect(byId[SIGNED]).toMatchObject({ signedIn: 'yes', action: ACTIONS.replacePasswordAndNotify })
    expect(byId[UNKNOWN]).toMatchObject({ club: '-', signedIn: 'unknown', action: ACTIONS.replacePasswordAndNotify })
  })

  it('skips Super Admins and deactivated accounts, listed last', async () => {
    const plan = await buildPlan(deps)
    expect(plan.find(r => r.id === SUPER)?.action).toBe(ACTIONS.skipSuperAdmin)
    expect(plan.find(r => r.id === INACTIVE)?.action).toBe(ACTIONS.skipDeactivated)
    expect(plan.slice(-2).map(r => r.id).sort()).toEqual([SUPER, INACTIVE].sort())
  })

  it('changes nothing and sends nothing', async () => {
    await buildPlan(deps)
    for (const w of WRITES) expect(deps[w]).not.toHaveBeenCalled()
  })
})

describe('approval file', () => {
  it('holds only accounts to handle, and reads back exactly', async () => {
    const plan = await buildPlan(deps)
    const text = formatApprovalFile(plan, new Date('2026-11-27T00:00:00Z'))
    expect(text).not.toContain(SUPER)
    expect(text).not.toContain(INACTIVE)
    expect([...parseApprovalFile(text)]).toEqual([
      [SIGNED, ACTIONS.replacePasswordAndNotify],
      [NEVER, ACTIONS.sendSetPasswordLink],
      [UNKNOWN, ACTIONS.replacePasswordAndNotify],
    ])
  })

  it('ignores comments and blank lines (deleting a line = not approved)', () => {
    expect(parseApprovalFile(`# header\n\n${NEVER} send_set_password_link  # zz\n`).size).toBe(1)
  })

  it.each([
    ['not an id', 'abc send_set_password_link'],
    ['missing action', NEVER],
    ['skip action', `${SUPER} skip_super_admin`],
    ['unknown action', `${NEVER} delete_account`],
    ['extra words', `${NEVER} send_set_password_link now`],
    ['listed twice', `${NEVER} send_set_password_link\n${NEVER} send_set_password_link`],
  ])('refuses a bad file: %s', (_name, text) => {
    expect(() => parseApprovalFile(text)).toThrow()
  })
})

describe('prepareLiveRun', () => {
  const approve = (entries: [string, PlannedAction][]) => new Map(entries)

  it('only takes approved accounts whose planned action is unchanged; new accounts slip in nowhere', async () => {
    const p = await prepareLiveRun(approve([[NEVER, ACTIONS.sendSetPasswordLink]]), 50, deps)
    expect(p.batch.map(r => r.id)).toEqual([NEVER])
    expect(p.notApproved.map(r => r.id).sort()).toEqual([SIGNED, UNKNOWN].sort())
  })

  it('leaves an account alone if it signed in since the dry run', async () => {
    deps.hasSignedIn.mockImplementation(async () => true)
    const p = await prepareLiveRun(approve([[NEVER, ACTIONS.sendSetPasswordLink]]), 50, deps)
    expect(p.batch).toEqual([])
    expect(p.changed.map(r => r.id)).toEqual([NEVER])
  })

  it('leaves an account alone if it became a Super Admin or was deactivated since', async () => {
    const p = await prepareLiveRun(approve([[SUPER, ACTIONS.replacePasswordAndNotify]]), 50, deps)
    expect(p.batch).toEqual([])
    expect(p.changed.map(r => r.id)).toEqual([SUPER])
  })

  it('reports approved accounts that are already done (re-run safe)', async () => {
    const done = id(7)
    const p = await prepareLiveRun(approve([[done, ACTIONS.sendSetPasswordLink]]), 50, deps)
    expect(p.notOnList).toEqual([done])
    expect(p.batch).toEqual([])
  })

  it('applies --limit and keeps the rest for the next run', async () => {
    const all = approve([[NEVER, ACTIONS.sendSetPasswordLink], [SIGNED, ACTIONS.replacePasswordAndNotify], [UNKNOWN, ACTIONS.replacePasswordAndNotify]])
    const p = await prepareLiveRun(all, 2, deps)
    expect(p.batch).toHaveLength(2)
    expect(p.deferred).toHaveLength(1)
  })

  it('changes nothing and sends nothing', async () => {
    await prepareLiveRun(approve([[NEVER, ACTIONS.sendSetPasswordLink]]), 50, deps)
    for (const w of WRITES) expect(deps[w]).not.toHaveBeenCalled()
  })
})

describe('runLive', () => {
  const batchOf = async (...ids: string[]) => (await buildPlan(deps)).filter(r => ids.includes(r.id))

  it('refuses to run unless the actor is an active Super Admin', async () => {
    const batch = await batchOf(NEVER)
    await expect(runLive({ batch, actorId: id(50), delayMs: 0, deps })).rejects.toThrow(/Super Admin/)
    deps.getActor.mockResolvedValueOnce({ role: 'super_admin', is_active: false })
    await expect(runLive({ batch, actorId: ACTOR, delayMs: 0, deps })).rejects.toThrow(/Super Admin/)
    for (const w of WRITES) expect(deps[w]).not.toHaveBeenCalled()
  })

  it('never signed in: sends a new set-password link through the invite code, nothing else', async () => {
    const [r] = await runLive({ batch: await batchOf(NEVER), actorId: ACTOR, delayMs: 0, deps })
    expect(r.outcome).toBe('link_sent')
    expect(deps.issueSetupLink).toHaveBeenCalledWith(NEVER, ACTOR)
    expect(calls).toEqual([`link:${NEVER}`])
  })

  it('signed in before: password replaced first, then sessions ended, then notice to the sign-in address', async () => {
    const [r] = await runLive({ batch: await batchOf(SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(r.outcome).toBe('password_replaced_notice_sent')
    expect(calls).toEqual([`password:${SIGNED}`, `sessions:${SIGNED}`, 'notice:auth-address@example.com'])
    expect(deps.sendNotice).toHaveBeenCalledWith({ to: 'auth-address@example.com', fullName: 'ZZ Champ', role: 'champion' })
    expect(deps.issueSetupLink).not.toHaveBeenCalled()
  })

  it('if the password cannot be replaced, no sign-out and no email', async () => {
    deps.replacePassword.mockResolvedValueOnce(false)
    const [r] = await runLive({ batch: await batchOf(SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(r.outcome).toBe('failed')
    expect(deps.revokeSessions).not.toHaveBeenCalled()
    expect(deps.sendNotice).not.toHaveBeenCalled()
  })

  it('flags a failed notice email or failed sign-out for a manual check', async () => {
    deps.sendNotice.mockResolvedValueOnce({ error: 'x', status: 401, reason: 'Maximum credits exceeded' })
    const [a] = await runLive({ batch: await batchOf(SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(a).toMatchObject({ outcome: 'password_replaced_notice_failed', note: 'Maximum credits exceeded' })
    deps.revokeSessions.mockResolvedValueOnce(false)
    const [b] = await runLive({ batch: await batchOf(SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(b.outcome).toBe('password_replaced_sessions_not_ended')
  })

  it('one account failing does not stop the rest', async () => {
    deps.issueSetupLink.mockRejectedValueOnce(new Error('boom'))
    const results = await runLive({ batch: await batchOf(NEVER, SIGNED, UNKNOWN), actorId: ACTOR, delayMs: 0, deps })
    expect(results.map(r => r.outcome)).toEqual(['password_replaced_notice_sent', 'failed', 'password_replaced_notice_sent'])
  })

  it('a refused invite is reported as failed with its reason', async () => {
    deps.issueSetupLink.mockResolvedValueOnce({ error: 'The invite email couldn’t be sent. Please try again.' })
    const [r] = await runLive({ batch: await batchOf(NEVER), actorId: ACTOR, delayMs: 0, deps })
    expect(r).toMatchObject({ outcome: 'failed', note: 'The invite email couldn’t be sent. Please try again.' })
  })

  it('writes one audit entry per account, failures included', async () => {
    deps.issueSetupLink.mockRejectedValueOnce(new Error('boom'))
    await runLive({ batch: await batchOf(NEVER, SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(deps.audit).toHaveBeenCalledTimes(2)
    expect(deps.audit).toHaveBeenCalledWith({ actorId: ACTOR, userId: NEVER, details: { action: ACTIONS.sendSetPasswordLink, outcome: 'failed', note: 'unexpected error' } })
    expect(deps.audit).toHaveBeenCalledWith({ actorId: ACTOR, userId: SIGNED, details: { action: ACTIONS.replacePasswordAndNotify, outcome: 'password_replaced_notice_sent' } })
  })

  it('a failed audit write is reported and does not stop the run', async () => {
    deps.audit.mockRejectedValueOnce(new Error('db'))
    const results = await runLive({ batch: await batchOf(NEVER, SIGNED), actorId: ACTOR, delayMs: 0, deps })
    expect(results[0].note).toMatch(/audit log entry not written/)
    expect(results).toHaveLength(2)
  })

  it('waits between accounts (to stay under the email limit)', async () => {
    await runLive({ batch: await batchOf(NEVER, SIGNED, UNKNOWN), actorId: ACTOR, delayMs: 5000, deps })
    expect(deps.sleep).toHaveBeenCalledTimes(2)
    expect(deps.sleep).toHaveBeenCalledWith(5000)
  })
})

describe('realDeps.replacePassword', () => {
  it('sets a random password and never returns it', async () => {
    const result = await realDeps().replacePassword(SIGNED)
    expect(result).toBe(true)
    const [userId, attrs] = h.updateUserById.mock.calls[0]
    expect(userId).toBe(SIGNED)
    expect(attrs.password.length).toBeGreaterThanOrEqual(20)
    await realDeps().replacePassword(SIGNED)
    expect(h.updateUserById.mock.calls[1][1].password).not.toBe(attrs.password)
  })

  it('reports a failure as false', async () => {
    h.updateUserById.mockResolvedValueOnce({ error: { message: 'nope' } })
    expect(await realDeps().replacePassword(SIGNED)).toBe(false)
  })

  it('audit entries use the Fix B action name', () => {
    expect(AUDIT_ACTION).toBe('account.temporary_password_retired')
  })
})
