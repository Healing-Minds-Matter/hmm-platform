// @supabase/auth-js's AuthRetryableFetchError (thrown for 5xx-class failures)
// sets `.message` to the raw JSON-stringified response body — literally the
// string "{}" in this project's case, since that error class doesn't parse
// the body's `msg`/`error_code` fields. Surface something actually useful
// instead of relaying that unhelpful literal to the user. Shared by every
// action that calls admin.auth.admin.createUser (Champions, Gatekeepers) —
// previously inviteUserByEmail, before the temp-password flow replaced it.
export function describeInviteError(err: { message?: string; status?: number }): string {
  const msg = err.message?.trim()
  const isUseless = !msg || msg === '{}' || msg.startsWith('{')
  // Review Finding 13a: Supabase Auth's own sentences (e.g. "A user with this
  // email address has already been registered") are shown; its database
  // errors ("Database error saving new user") never are.
  const isDatabaseText = !!msg && /database|sql|constraint|relation|violates|unexpected/i.test(msg)
  if (!isUseless && !isDatabaseText) return msg
  if (err.status === 500) {
    return 'Failed to create the account — Supabase returned a server error. Please try again in a moment.'
  }
  return `Failed to create the account (unexpected error${err.status ? `, status ${err.status}` : ''}).`
}
