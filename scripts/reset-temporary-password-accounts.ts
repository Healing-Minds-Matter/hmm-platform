// Fix B: retire every temporary password that is still in use.
// Super Admin only. Run from the hmm-platform folder.
//
// DRY RUN (the default: reads only, changes nothing, sends nothing):
//   npx tsx --conditions=react-server --env-file=<env file> scripts/reset-temporary-password-accounts.ts --out approved.txt
//
// LIVE RUN (only the accounts in the approved file, with the same planned action):
//   npx tsx --conditions=react-server --env-file=<env file> scripts/reset-temporary-password-accounts.ts \
//     --live --approved approved.txt --actor <Super Admin account id> [--limit 50] [--delay-seconds 5] [--confirm <count>]
//
// The live run first prints how many accounts it would change (and how many
// of them get an email) and stops; run it again with --confirm <that count> to
// go ahead. Passwords are never printed.
//
// Made-up addresses (example.com, .test, ...) are planned as "no email": the
// password is replaced and sessions ended, but nothing is sent. To do the same
// for any other approved account, change its line's action in the approval
// file to replace_password_no_email.
import fs from 'fs'
import { parseArgs } from 'util'
import {
  ACTIONS, buildPlan, formatApprovalFile, isRunnable, parseApprovalFile, prepareLiveRun, realDeps, runLive, sendsEmail,
  type PlanRow, type RunResult,
} from '@/lib/temporary-password-reset.server'

const DEFAULT_LIMIT = 50 // SendGrid free plan: 100 emails a day, shared with Supabase's own emails.
const DEFAULT_DELAY_SECONDS = 5

const ACTION_TEXT: Record<string, string> = {
  [ACTIONS.sendSetPasswordLink]: 'send new set-password link',
  [ACTIONS.replacePasswordAndNotify]: 'replace password, sign out, send notice',
  [ACTIONS.replacePasswordNoEmail]: 'replace password, sign out, NO email',
  [ACTIONS.skipSuperAdmin]: 'SKIP (Super Admin)',
  [ACTIONS.skipDeactivated]: 'SKIP (deactivated)',
}

const USAGE = `Dry run (default; changes nothing, sends nothing):
  npx tsx --conditions=react-server --env-file=<env file> scripts/reset-temporary-password-accounts.ts --out approved.txt
Live run (only accounts in the approved file):
  ... --live --approved approved.txt --actor <Super Admin id> [--limit ${DEFAULT_LIMIT}] [--delay-seconds ${DEFAULT_DELAY_SECONDS}] [--confirm <count>]`

function fail(message: string, code = 1): never {
  console.error(`\nSTOPPED: ${message}`)
  process.exit(code)
}

function printPlan(rows: PlanRow[], title: string) {
  console.log(`\n${title} (${rows.length})`)
  if (!rows.length) { console.log('  (none)'); return }
  rows.forEach((r, i) => {
    const signed = r.signedIn === 'never' ? 'never signed in' : r.signedIn === 'yes' ? 'has signed in' : 'sign-in unknown (treated as signed in)'
    console.log(`  ${String(i + 1).padStart(3)}. ${r.email} | ${r.role} | ${r.club} | ${signed} | ${ACTION_TEXT[r.action]}`)
    console.log(`       id ${r.id}`)
  })
}

const OUTCOME_TEXT: Record<RunResult['outcome'], string> = {
  link_sent: 'OK: set-password link sent',
  password_replaced_notice_sent: 'OK: password replaced, signed out, notice sent',
  password_replaced_notice_failed: 'CHECK: password replaced and signed out, but the notice email FAILED',
  password_replaced_sessions_not_ended: 'CHECK: password replaced, but sessions could NOT be ended',
  password_replaced_no_email: 'OK: password replaced, signed out, no email (as planned)',
  failed: 'FAILED',
  skipped_not_on_list: 'skipped',
  skipped_changed_since_dry_run: 'skipped',
}

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: 'boolean', default: false },
      approved: { type: 'string' },
      actor: { type: 'string' },
      limit: { type: 'string' },
      'delay-seconds': { type: 'string' },
      confirm: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(USAGE); return }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file).')
  }
  console.log(`Database: ${new URL(supabaseUrl).host}`)
  console.log(values.live ? 'Mode: LIVE RUN' : 'Mode: DRY RUN (reads only; nothing is changed or sent)')

  const deps = realDeps()

  if (!values.live) {
    if (values.approved || values.confirm) fail('--approved and --confirm are only for --live.')
    const plan = await buildPlan(deps)
    printPlan(plan.filter(r => isRunnable(r.action)), 'Would be handled')
    printPlan(plan.filter(r => !isRunnable(r.action)), 'Skipped (left as they are)')
    if (values.out) {
      if (fs.existsSync(values.out)) fail(`${values.out} already exists; choose a new file name.`)
      fs.writeFileSync(values.out, formatApprovalFile(plan, new Date()), { encoding: 'utf-8', flag: 'wx' })
      console.log(`\nApproval file written: ${values.out}`)
    }
    console.log('\nDry run finished. Nothing was changed. Nothing was sent.')
    return
  }

  // ── Live run ──
  if (!values.approved) fail('--live needs --approved <file from the dry run>.')
  if (!values.actor) fail('--live needs --actor <Super Admin account id>.')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl || /localhost|127\.0\.0\.1/.test(siteUrl)) fail('NEXT_PUBLIC_SITE_URL must be the real site (links in the emails use it).')
  if (!process.env.SENDGRID_API_KEY) fail('SENDGRID_API_KEY must be set.')
  const limit = values.limit ? Number(values.limit) : DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1) fail('--limit must be a whole number of 1 or more.')
  const delaySeconds = values['delay-seconds'] ? Number(values['delay-seconds']) : DEFAULT_DELAY_SECONDS
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) fail('--delay-seconds must be 0 or more.')

  let approved
  try {
    approved = parseApprovalFile(fs.readFileSync(values.approved, 'utf-8'))
  } catch (e) {
    fail(e instanceof Error ? e.message : 'Could not read the approved file.')
  }
  if (!approved.size) fail('The approved file lists no accounts.')

  const prepared = await prepareLiveRun(approved, limit, deps)
  printPlan(prepared.batch, 'Will be handled now')
  printPlan(prepared.changed, 'Approved, but CHANGED since the dry run, so NOT touched (run a new dry run)')
  printPlan(prepared.notApproved, 'On the list now but NOT in your approved file, so NOT touched')
  printPlan(prepared.deferred, `Approved, but over --limit ${limit}, so left for the next run`)
  if (prepared.notOnList.length) {
    console.log(`\nApproved but no longer on a temporary password (already done), skipped: ${prepared.notOnList.length}`)
    prepared.notOnList.forEach(id => console.log(`  id ${id}`))
  }

  const count = prepared.batch.length
  if (!count) { console.log('\nNothing to do. Nothing was changed. Nothing was sent.'); return }
  if (values.confirm !== String(count)) {
    const emails = prepared.batch.filter(r => sendsEmail(r.action)).length
    console.log(`\n${count} account(s) would be changed; ${emails} of them get an email (${count - emails} without). About ${Math.ceil((count - 1) * delaySeconds / 60)} min at one every ${delaySeconds}s.`)
    console.log(`Nothing was changed. To go ahead, run the same command again with: --confirm ${count}`)
    process.exitCode = 2
    return
  }

  console.log(`\nStarting: ${count} account(s), one every ${delaySeconds}s.`)
  const results = await runLive({
    batch: prepared.batch,
    actorId: values.actor,
    delayMs: delaySeconds * 1000,
    deps,
    onResult: (r, i) => console.log(`  ${String(i + 1).padStart(3)}/${count} ${r.email}: ${OUTCOME_TEXT[r.outcome]}${r.note ? ` (${r.note})` : ''}`),
  })

  const OK_OUTCOMES = new Set<RunResult['outcome']>(['link_sent', 'password_replaced_notice_sent', 'password_replaced_no_email'])
  const ok = results.filter(r => OK_OUTCOMES.has(r.outcome)).length
  const failed = results.filter(r => r.outcome === 'failed').length
  console.log(`\nDone: ${ok} OK, ${results.length - ok - failed} need a check, ${failed} failed.`)
  if (failed) console.log('Failed: see the reason above. Any account still on a temporary password is retried by the next run (new dry run first).')
  if (results.length - ok - failed) console.log('"Need a check" accounts no longer have their temporary password but may need a manual follow-up (see above).')
  if (failed) process.exitCode = 1
}

main().catch(e => fail(`${e instanceof Error ? e.message : 'Unexpected error'}. Nothing more was done.`))
