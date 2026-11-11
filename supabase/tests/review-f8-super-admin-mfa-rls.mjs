// Database tests for Review Finding 8 — a Super Admin's password alone
// (an aal1 session) gets no data; after a real authenticator code (aal2) it
// does. Champions and Gatekeepers are unaffected. Also checks the new auth
// settings (sign-up off, 12-character minimum).
//
//   node supabase/tests/review-f8-super-admin-mfa-rls.mjs   (from the project root)
//
// LOCAL SUPABASE ONLY (refuses otherwise). Needs migration 20261113000004
// and config.toml's [auth.mfa.totp] enroll/verify enabled.
import './_local-only.mjs'
import crypto from 'node:crypto'

const { admin, newAnonClient, rlsSuite } = await import('./_rls-helpers.mjs')
const { check, mkClub, mkUser, run } = rlsSuite('rf8')

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret.
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = crypto.createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0')
}

await run(async () => {
  const club = await mkClub('A')
  const sa = await mkUser('sa', 'super_admin', null)
  const ch = await mkUser('ch', 'champion', club)

  const { data: before } = await sa.db.from('clubs').select('id')
  check('Super Admin, password only (aal1): reads no clubs', !before?.length)
  const { error: clubErr } = await sa.db.rpc('set_club_active', { p_club_id: club, p_active: false })
  check('Super Admin, aal1: can’t change a club’s status', !!clubErr)
  const { data: st } = await sa.db.rpc('my_account_status')
  check('Super Admin, aal1: my_account_status() still readable', (Array.isArray(st) ? st[0] : st)?.role === 'super_admin')

  const { data: enrolled, error: enrolErr } = await sa.db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'rf8 test' })
  check('Super Admin can set up an authenticator', !enrolErr && !!enrolled?.totp?.secret)
  const { error: verifyErr } = await sa.db.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) })
  check('…and verify a real code', !verifyErr)
  const { data: aal } = await sa.db.auth.mfa.getAuthenticatorAssuranceLevel()
  check('…which makes the session aal2', aal?.currentLevel === 'aal2')
  const { data: after } = await sa.db.from('clubs').select('id').eq('id', club)
  check('Super Admin, aal2: reads clubs', after?.length === 1)
  const { error: wrongCode } = await sa.db.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: '000000' })
  check('a wrong code is refused', !!wrongCode)

  const { data: chClubs } = await ch.db.from('clubs').select('id')
  check('Champion, password only: unaffected', chClubs?.length === 1)

  // Auth settings from config.toml.
  const { error: signUpErr } = await newAnonClient().auth.signUp({ email: `zz-rls-rf8-signup-${Date.now()}@example.com`, password: 'Kandy!Lake42-long' })
  check('public sign-up is off', !!signUpErr)
  const { error: shortErr } = await admin.auth.admin.updateUserById(ch.id, { password: 'Kandy!Lake4' })
  check('an 11-character password is refused by Supabase', !!shortErr)
})
