// One set of rules for creating clubs, used by both the single "Create New
// Club" form and the bulk CSV upload (actions/clubs.ts). Nothing here talks
// to the database directly — the caller passes in the existing clubs and the
// insert — so the rules can be unit-tested.

import { parsePhone } from '@/lib/phone'
import type { CsvUpload } from '@/lib/csv'
import { PROBLEM_COLUMN, type BulkIntent, type BulkRowResult } from '@/lib/bulk-upload'

export type ClubInput = {
  name?: string | null
  code?: string | null
  address?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  description?: string | null
}

// Ready to insert into public.clubs.
export type ClubFields = {
  name: string
  club_code: string
  location: string
  description: string | null
  contact_email: string | null
  contact_phone: string | null
}

export type ExistingClub = { name: string; club_code: string | null }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateClubFields(input: ClubInput): { club: ClubFields } | { error: string } {
  const code = input.code?.trim()
  const name = input.name?.trim()
  const address = input.address?.trim()
  const contactEmail = input.contactEmail?.trim() || null
  const description = input.description?.trim() || null

  if (!code) return { error: 'Club code is required.' }
  if (!name) return { error: 'Club name is required.' }
  if (!address) return { error: 'Address is required.' }
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    return { error: 'Enter a valid contact email, e.g. club@example.com.' }
  }
  // Same normalising as user phone numbers: local numbers are Sri Lankan.
  const phone = parsePhone(input.contactPhone)
  if (!phone.ok) return { error: phone.error }

  return {
    club: {
      name,
      club_code: code,
      location: address,
      description,
      contact_email: contactEmail,
      contact_phone: phone.value,
    },
  }
}

const sameText = (a: string | null, b: string) => a !== null && a.trim().toLowerCase() === b.trim().toLowerCase()

// Names and codes must be unique regardless of capitals ("CLB-007" and
// "clb-007" are the same club).
export function findClubConflict(club: Pick<ClubFields, 'name' | 'club_code'>, existing: ExistingClub[]): string | null {
  if (existing.some(c => sameText(c.club_code, club.club_code))) {
    return `Club code "${club.club_code}" is already taken. Please choose a unique code.`
  }
  if (existing.some(c => sameText(c.name, club.name))) {
    return 'A club with that name already exists.'
  }
  return null
}

// Backstop for a clash the check above couldn't see (e.g. two people saving
// at the same moment): the database's own unique indexes.
export function describeClubInsertError(error: { code?: string; message: string }, club: Pick<ClubFields, 'club_code'>): string {
  if (error.code === '23505') {
    return error.message.includes('club_code')
      ? `Club code "${club.club_code}" is already taken. Please choose a unique code.`
      : 'A club with that name already exists.'
  }
  return 'The club could not be saved. Please try again.'
}

// ---------------------------------------------------------------------------
// Bulk CSV upload
// ---------------------------------------------------------------------------

export const CLUB_CSV_COLUMNS = ['name', 'code', 'address', 'contact_email', 'contact_phone', 'description'] as const

// Shown as soon as a file is chosen, and checked again on the server. The
// header must match exactly; a trailing "problem" column (from the "Download
// failed rows" file) is allowed and ignored.
export function clubCsvHeaderError(header: string[]): string | null {
  const columns = header[header.length - 1] === PROBLEM_COLUMN ? header.slice(0, -1) : header
  const expected = CLUB_CSV_COLUMNS.join(',')
  return columns.join(',') === expected ? null : `The first row of the file must be exactly: ${expected}. Nothing was created.`
}

export type BulkClubDeps = {
  existingClubs: ExistingClub[]
  insertClub: (club: ClubFields) => Promise<{ id: string } | { error: string }>
  onCreated: (id: string, club: ClubFields) => Promise<void>
}

// intent 'check' validates every row and saves nothing; 'save' creates the
// rows that pass and skips the rest.
export async function createClubsFromCsv(
  upload: CsvUpload,
  deps: BulkClubDeps,
  intent: BulkIntent
): Promise<{ error: string } | { results: BulkRowResult[] }> {
  const headerError = clubCsvHeaderError(upload.header)
  if (headerError) return { error: headerError }

  const known = [...deps.existingClubs]
  const codesInFile = new Map<string, number>()
  const namesInFile = new Map<string, number>()
  const results: BulkRowResult[] = []

  for (const { line, cells } of upload.rows) {
    const [name, code, address, contactEmail, contactPhone, description] = cells
    const fail = (error: string) => { results.push({ row: line, label: name || '(no name)', status: 'failed', error }) }

    if (cells.length > upload.header.length) {
      fail('This row has more columns than the header. Put quotes around any value that contains a comma.')
      continue
    }
    const checked = validateClubFields({ name, code, address, contactEmail, contactPhone, description })
    if ('error' in checked) { fail(checked.error); continue }
    const club = checked.club

    const codeKey = club.club_code.toLowerCase()
    const nameKey = club.name.toLowerCase()
    if (codesInFile.has(codeKey)) { fail(`Same club code as row ${codesInFile.get(codeKey)} in this file.`); continue }
    if (namesInFile.has(nameKey)) { fail(`Same club name as row ${namesInFile.get(nameKey)} in this file.`); continue }
    codesInFile.set(codeKey, line)
    namesInFile.set(nameKey, line)

    const conflict = findClubConflict(club, known)
    if (conflict) { fail(conflict); continue }

    if (intent === 'check') {
      results.push({ row: line, label: club.name, status: 'ready' })
      continue
    }

    const inserted = await deps.insertClub(club)
    if ('error' in inserted) { fail(inserted.error); continue }

    known.push({ name: club.name, club_code: club.club_code })
    await deps.onCreated(inserted.id, club)
    results.push({ row: line, label: club.name, status: 'created' })
  }

  return { results }
}
