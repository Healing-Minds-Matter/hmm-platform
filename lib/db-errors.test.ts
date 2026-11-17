// Review Finding 13a: database errors reach people in plain English only, and
// server logs carry no personal data.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbErrorState, describeDbError, logDbError, messageForPeople } from '@/lib/db-errors'
import { describeCertError } from '@/lib/certificates'
import { describeTypeError } from '@/lib/certification-types'

const RLS = { code: '42501', message: 'new row violates row-level security policy for table "profiles"' }
const UNIQUE_EMAIL = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "profiles_email_key"',
  details: 'Key (email)=(asha@example.com) already exists.',
}
const CHECK = { code: '23514', message: 'new row for relation "clubs" violates check constraint "clubs_name_check"' }
const FK = { code: '23503', message: 'insert or update on table "profiles" violates foreign key constraint "profiles_club_id_fkey"' }
const BAD_UUID = { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' }
const OURS = { code: 'P0001', message: 'This category is in use, so it can’t be deleted. Deactivate it instead.' }
const OURS_CHECK = { code: '23514', message: 'Describe the event type.' }

describe('describeDbError', () => {
  it.each([
    ['RLS refusal', RLS, 'You don’t have permission to do that.'],
    ['unique clash', UNIQUE_EMAIL, 'This has already been added. Check for an existing record with the same details.'],
    ['check constraint', CHECK, 'One of the values isn’t allowed. Check the form and try again.'],
    ['foreign key', FK, 'Something this refers to no longer exists. Refresh the page and try again.'],
    ['bad value', BAD_UUID, 'One of the values isn’t in the right format.'],
    ['not found', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'We couldn’t find that record. It may have been removed. Refresh the page and try again.'],
    ['unknown', { code: 'XX000', message: 'internal error at line 4 in function foo' }, 'Something went wrong. Please try again.'],
    ['empty "{}"', { code: undefined, message: '{}' }, 'Something went wrong. Please try again.'],
  ])('%s → plain English, no database wording', (_label, error, expected) => {
    const { message } = describeDbError(error)
    expect(message).toBe(expected)
    expect(message).not.toMatch(/violates|constraint|relation|uuid|row-level|profiles|@/)
  })

  it('our own database messages (written for people) are shown as they are', () => {
    expect(describeDbError(OURS).message).toBe(OURS.message)
    expect(describeDbError(OURS_CHECK).message).toBe('Describe the event type.')
    expect(messageForPeople(RLS)).toBeNull()
    expect(messageForPeople(CHECK)).toBeNull()
  })

  it('a known constraint maps to its own field and message', () => {
    expect(dbErrorState(UNIQUE_EMAIL, { constraints: { profiles_email_key: { field: 'email', message: 'An account with this email already exists.' } } }))
      .toEqual({ error: 'An account with this email already exists.', fieldErrors: { email: 'An account with this email already exists.' } })
  })

  it('custom fallback and permission wording', () => {
    expect(describeDbError({ code: 'XX000', message: 'boom' }, { fallback: 'The club could not be saved. Please try again.' }).message)
      .toBe('The club could not be saved. Please try again.')
    expect(describeDbError(RLS, { permission: 'Only Super Admins can do that.' }).message).toBe('Only Super Admins can do that.')
  })
})

describe('logDbError', () => {
  afterEach(() => vi.restoreAllMocks())
  it('logs the code and constraint only — never values such as an email address', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logDbError('updateGatekeeperAction', UNIQUE_EMAIL)
    expect(spy).toHaveBeenCalledWith('[updateGatekeeperAction] database error', { code: '23505', constraint: 'profiles_email_key' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('asha@example.com')
  })
})

describe('existing helpers no longer pass raw database wording through', () => {
  it('certificates: RLS and constraint text is replaced; our own rule messages stay', () => {
    expect(describeCertError(RLS)).toBe('You don’t have permission to do that.')
    expect(describeCertError(CHECK)).not.toMatch(/violates|constraint/)
    expect(describeCertError({ code: 'P0001', message: 'This certificate was removed, so it can’t be changed.' })).toBe('This certificate was removed, so it can’t be changed.')
  })
  it('certification types: same', () => {
    expect(describeTypeError(RLS)).toBe('You don’t have permission to do that.')
    expect(describeTypeError(CHECK)).not.toMatch(/violates|constraint/)
  })
})

// ── Source checks: raw error text and personal data in logs can't come back ──
const ROOTS = ['app', 'components', 'lib', 'actions']
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}
const lines = () => ROOTS.flatMap(sourceFiles).flatMap(path =>
  readFileSync(path, 'utf8').split('\n').map((text, i) => ({ path, line: i + 1, text })))

describe('source checks', () => {
  it('no action or page hands a raw error message to the person', () => {
    const raw = lines().filter(l =>
      /\{\s*error:\s*\w*[eE]rror\??\.message\s*\}/.test(l.text) ||   // return { error: error.message }
      /error=\{\s*\w*[eE]rror\??\.message\s*\}/.test(l.text) ||       // <X error={error?.message} />
      /\{\s*\w*[eE]rror\??\.message\s*\}\s*<\//.test(l.text))         // <p>…{error.message}</p>
    expect(raw.map(l => `${l.path}:${l.line}`)).toEqual([])
  })

  it('the TEMP DIAGNOSTIC log is gone, and no log line prints an email address, name or phone', () => {
    const offending = lines().filter(l =>
      /TEMP DIAGNOSTIC/.test(l.text) ||
      // A logged value (not just the word inside the log's own label text).
      (/console\.(log|error|warn|info|debug)\(/.test(l.text) &&
        /\b(email|full_?[nN]ame|phone|newEmail|currentEmail)\b/.test(l.text.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ''))))
    expect(offending.map(l => `${l.path}:${l.line}: ${l.text.trim()}`)).toEqual([])
  })
})

describe('account creation errors from Supabase Auth', () => {
  it('its own sentences are shown; its database errors are not', async () => {
    const { describeInviteError } = await import('@/lib/invite-errors')
    expect(describeInviteError({ message: 'A user with this email address has already been registered', status: 422 }))
      .toBe('A user with this email address has already been registered')
    expect(describeInviteError({ message: 'Database error saving new user', status: 500 })).not.toMatch(/database/i)
  })
})
