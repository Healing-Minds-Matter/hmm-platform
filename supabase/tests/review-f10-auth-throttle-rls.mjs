// Database tests for Review Finding 10: the sign-in / reset-request counters.
// Only the server (service role) may use them; nobody can read or change the
// table directly. Checks the SQL rules with short windows so blocks expire
// within the run.
//
//   node supabase/tests/review-f10-auth-throttle-rls.mjs   (from the project root)
//
// Needs migration 20261116000000. LOCAL SUPABASE ONLY (refuses otherwise).
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, run } = rlsSuite('rf10')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const denied = e => !!e && (e.code === 'PGRST202' || e.code === '42501' || /permission denied/i.test(e.message ?? ''))
const tag = `test:${crypto.randomUUID()}`

// 5 failures in 60 s → 2 s block, doubling to at most 3 s; lockouts forgotten 1 s after a block ends.
const fail = key => admin.rpc('auth_throttle_record_failure', {
  p_key: key, p_max: 5, p_window_seconds: 60, p_base_block_seconds: 2, p_max_block_seconds: 3, p_lockout_memory_seconds: 1,
}).then(({ data, error }) => { if (error) throw error; return data[0] })
const blocked = keys => admin.rpc('auth_throttle_blocked_until', { p_keys: keys }).then(({ data, error }) => { if (error) throw error; return data })
const hit = key => admin.rpc('auth_throttle_hit', { p_key: key, p_max: 3, p_window_seconds: 2 }).then(({ data, error }) => { if (error) throw error; return data })

await run(async () => {
  const club = await mkClub('A')
  const gk = await mkUser('gk', 'gatekeeper', club)
  const chOwn = await mkUser('ch', 'champion', club)
  const sa = await mkUser('sa', 'super_admin', null)

  // ── Who can use it ──
  const callers = [['not signed in', newAnonClient()], ['Gatekeeper', gk.db], ['Champion', chOwn.db], ['Super Admin', sa.db]]
  for (const [label, db] of callers) {
    const { error: e1 } = await db.rpc('auth_throttle_clear', { p_key: `${tag}:x` })
    check(`${label}: can't call auth_throttle_clear`, denied(e1), e1?.message ?? 'allowed')
    const { error: e2 } = await db.rpc('auth_throttle_record_failure', { p_key: `${tag}:x`, p_max: 5, p_window_seconds: 60, p_base_block_seconds: 2, p_max_block_seconds: 3, p_lockout_memory_seconds: 1 })
    check(`${label}: can't call auth_throttle_record_failure`, denied(e2), e2?.message ?? 'allowed')
    const { error: e3 } = await db.rpc('auth_throttle_blocked_until', { p_keys: [`${tag}:x`] })
    check(`${label}: can't call auth_throttle_blocked_until`, denied(e3), e3?.message ?? 'allowed')
    const { error: e4 } = await db.rpc('auth_throttle_hit', { p_key: `${tag}:x`, p_max: 3, p_window_seconds: 2 })
    check(`${label}: can't call auth_throttle_hit`, denied(e4), e4?.message ?? 'allowed')
    const { data, error } = await db.from('auth_throttle').select('key').limit(1)
    check(`${label}: can't read auth_throttle`, !!error || (data ?? []).length === 0, `${data?.length} rows`)
    const { error: ins } = await db.from('auth_throttle').insert({ key: `${tag}:forged`, expires_at: new Date().toISOString() })
    check(`${label}: can't write auth_throttle`, !!ins)
  }
  const { error: svcTable } = await admin.from('auth_throttle').select('key').limit(1)
  check('server: table itself not reachable directly either (functions only)', !!svcTable, 'select allowed')

  // ── 5 failures → block; block expires ──
  const acct = `${tag}:acct`
  for (let i = 1; i <= 4; i++) check(`failure ${i}: not locked`, (await fail(acct)).locked === false)
  const fifth = await fail(acct)
  check('failure 5: locked, first lockout', fifth.locked === true && fifth.lockouts === 1)
  check('blocked now', !!(await blocked([acct, `${tag}:other`])))
  const sixth = await fail(acct)
  check('a failure during the block doesn’t extend it', sixth.locked === false && sixth.blocked_until === fifth.blocked_until)
  await sleep(2200)
  check('block expired', (await blocked([acct])) === null)

  // ── repeat lockout doubles (capped) ──
  for (let i = 0; i < 4; i++) await fail(acct)
  const second = await fail(acct)
  const secs = (new Date(second.blocked_until) - Date.now()) / 1000
  check('second lockout: lockouts=2, block capped at 3 s (2×2=4 → 3)', second.lockouts === 2 && secs > 2 && secs <= 3.2, `${secs}s`)
  await sleep(3200 + 1200)
  for (let i = 0; i < 4; i++) await fail(acct)
  check('lockouts forgotten after the memory period', (await fail(acct)).lockouts === 1)

  // ── success resets ──
  const acct2 = `${tag}:acct2`
  for (let i = 0; i < 4; i++) await fail(acct2)
  await admin.rpc('auth_throttle_clear', { p_key: acct2 })
  for (let i = 0; i < 4; i++) await fail(acct2)
  check('after clear, 4 more failures don’t lock', (await blocked([acct2])) === null)

  // ── parallel failures are all counted ──
  const acct3 = `${tag}:acct3`
  const results = await Promise.all(Array.from({ length: 5 }, () => fail(acct3)))
  check('5 parallel failures → exactly one lockout', results.filter(r => r.locked).length === 1)

  // ── reset-request limit ──
  const reset = `${tag}:reset`
  const hits = [await hit(reset), await hit(reset), await hit(reset), await hit(reset)]
  check('reset requests: 3 allowed, 4th refused', JSON.stringify(hits) === '[true,true,true,false]', JSON.stringify(hits))
  await sleep(2200)
  check('reset requests: allowed again after the window', (await hit(reset)) === true)

  // ── bad settings refused ──
  const { error: bad } = await admin.rpc('auth_throttle_hit', { p_key: reset, p_max: 0, p_window_seconds: 2 })
  check('invalid settings are refused', !!bad)
})
