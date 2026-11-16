// Database tests for Review Finding 13f: nobody can read, add, change or
// delete password history through the API — not even their own. Only the
// server (service role) writes it, and it can't change a row. People see only
// the date of their own last change, via my_password_changed_at().
//
//   node supabase/tests/review-f13f-password-history-rls.mjs   (from the project root)
//
// Needs migration 20261116000001. LOCAL SUPABASE ONLY (refuses otherwise).
import './_local-only.mjs'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('rf13f')

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const chOwn = await mkUser('ch', 'champion', A)
  const chOther = await mkUser('ch2', 'champion', B)
  const sa = await mkUser('sa', 'super_admin', null)
  const gone = await mkUser('gone', 'gatekeeper', A)
  const people = [gk, chOwn, chOther, sa, gone]
  onCleanup(async () => { await admin.from('password_history').delete().in('user_id', people.map(p => p.id)) })

  // The server records a history entry for each person.
  for (const [i, p] of people.entries()) {
    const { error } = await admin.from('password_history').insert({ user_id: p.id, password_hash: '$2a$10$abcdefghijklmnopqrstuuv0123456789012345678901234567' })
    check(`server: records history (person ${i + 1})`, !error, error?.message)
  }
  await admin.from('profiles').update({ is_active: false, deactivation_reason: 'manual' }).eq('id', gone.id)

  const callers = [
    ['not signed in', newAnonClient(), null],
    ['Gatekeeper', gk.db, gk],
    ['Champion (own club)', chOwn.db, chOwn],
    ['Champion (other club)', chOther.db, chOther],
    ['Super Admin', sa.db, sa],
    ['deactivated user', gone.db, gone],
  ]
  for (const [label, db, me] of callers) {
    const { data: read } = await db.from('password_history').select('*')
    check(`${label}: can't read any password history (own or others')`, !(read ?? []).length, `${read?.length} rows`)
    const { error: ins } = await db.from('password_history').insert({ user_id: me?.id ?? gk.id, password_hash: 'x' })
    check(`${label}: can't add a history entry`, !!ins)
    await db.from('password_history').update({ password_hash: 'x' }).eq('user_id', me?.id ?? gk.id)
    await db.from('password_history').delete().eq('user_id', me?.id ?? gk.id)
    const { data: still } = await admin.from('password_history').select('password_hash').eq('user_id', me?.id ?? gk.id)
    check(`${label}: can't change or delete history (the no-reuse rule holds)`, still?.length === 1 && still[0].password_hash !== 'x', JSON.stringify(still))
  }

  // Only the date of one's own last change.
  const { data: own, error: ownErr } = await gk.db.rpc('my_password_changed_at')
  check('Gatekeeper: sees the date of their own last change', !ownErr && typeof own === 'string', ownErr?.message)
  const { error: anonErr } = await newAnonClient().rpc('my_password_changed_at')
  check('not signed in: can’t call my_password_changed_at', !!anonErr)
  const { data: goneDate } = await gone.db.rpc('my_password_changed_at')
  check('deactivated user: gets no date', goneDate == null)

  // The server can add and prune, but never rewrite, history.
  const { error: svcUpd } = await admin.from('password_history').update({ password_hash: 'x' }).eq('user_id', gk.id)
  check('server: can’t change a history entry either', !!svcUpd, 'update allowed')
  const { error: svcDel } = await admin.from('password_history').delete().eq('user_id', chOther.id)
  check('server: can prune old entries', !svcDel, svcDel?.message)
})
