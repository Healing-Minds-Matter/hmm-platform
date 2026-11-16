// Review Finding 13a: one place that turns a database error into plain
// English for the person using the portal. Raw database text (table,
// constraint and column names, values in "Key (email)=(…)") is never shown;
// it isn't logged either: only the error code and constraint name are.
//
// Messages the database raises on purpose (our own triggers and functions:
// RAISE EXCEPTION … in the migrations) are written for people, so they are
// shown as they are. Postgres's and PostgREST's own messages are recognised
// by their wording and replaced.

export type DbError = { code?: string | null; message?: string | null; details?: string | null } | null | undefined

/** Postgres / PostgREST wording that must never reach a person. */
const BUILT_IN_WORDING = [
  /violates (check|foreign key|unique|not-null|exclusion) constraint/i,
  /row-level security/i,
  /permission denied/i,
  /duplicate key value/i,
  /invalid input (syntax|value)/i,
  /null value in column/i,
  /value too long/i,
  /out of range/i,
  /(relation|column|function|schema) .* does not exist/i,
  /could not find the/i,
  /schema cache/i,
  /JSON object requested/i,
  /syntax error/i,
  /^\s*\{\s*\}\s*$/,
]

/** Codes our own migrations raise with a sentence written for people. */
const OWN_MESSAGE_CODES = new Set(['P0001', '23514', '42501', '22023', '23505', 'P0002'])

/** The database's message, if it is one of ours written for people; otherwise null. */
export function messageForPeople(error: DbError): string | null {
  const message = error?.message?.trim()
  if (!message || !error?.code || !OWN_MESSAGE_CODES.has(error.code)) return null
  return BUILT_IN_WORDING.some(re => re.test(message)) ? null : message
}

/** The constraint a Postgres error names, e.g. "profiles_email_key". */
export function constraintOf(error: DbError): string | null {
  return error?.message?.match(/constraint "([^"]+)"/)?.[1] ?? null
}

type Mapped = { message: string; field?: string }

export type DbErrorOptions = {
  /** Shown when nothing more specific fits. */
  fallback?: string
  /** Shown for a permission refusal. */
  permission?: string
  /** By constraint name: unique, check or foreign-key constraints with their own message (and form field). */
  constraints?: Record<string, Mapped>
}

/** A plain-English message (and the form field it belongs to, if known) for a database error. */
export function describeDbError(error: DbError, options: DbErrorOptions = {}): Mapped {
  const fallback = options.fallback ?? 'Something went wrong. Please try again.'
  if (!error) return { message: fallback }
  const constraint = constraintOf(error)
  if (constraint && options.constraints?.[constraint]) return options.constraints[constraint]

  const own = messageForPeople(error)
  if (own) return { message: own }

  const message = error.message ?? ''
  switch (error.code) {
    case '23505':
      return { message: 'This has already been added. Check for an existing record with the same details.' }
    case '23503':
      return { message: 'Something this refers to no longer exists. Refresh the page and try again.' }
    case '23514':
      return { message: 'One of the values isn’t allowed. Check the form and try again.' }
    case '23502':
      return { message: 'A required field is missing.' }
    case '22001':
      return { message: 'One of the values is too long.' }
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return { message: 'One of the values isn’t in the right format.' }
    case '42501':
      return { message: options.permission ?? 'You don’t have permission to do that.' }
    case 'PGRST116':
      return { message: 'We couldn’t find that record. It may have been removed. Refresh the page and try again.' }
    case '40001':
    case '40P01':
      return { message: 'Someone else changed this at the same time. Please try again.' }
  }
  if (/row-level security|permission denied/i.test(message)) return { message: options.permission ?? 'You don’t have permission to do that.' }
  return { message: fallback }
}

/** A failed form save: top-of-form message, plus the field's own message when it is about one field. */
export function dbErrorState(error: DbError, options: DbErrorOptions = {}): { error: string; fieldErrors?: Record<string, string> } {
  const { message, field } = describeDbError(error, options)
  return field ? { error: message, fieldErrors: { [field]: message } } : { error: message }
}

/** Server log for a database error: the code and constraint only (no values, no personal data). */
export function logDbError(where: string, error: DbError): void {
  if (!error) return
  console.error(`[${where}] database error`, { code: error.code ?? null, constraint: constraintOf(error) })
}
