// Header rule for the Gatekeeper bulk CSV upload, shared by the upload
// screen (checked as soon as a file is chosen) and the server action.
// Column order doesn't matter and extra columns are ignored. A Champion's
// rows always go to their own club, so club_id is optional for them.
// Certificates aren't part of registration (they're added from each person's
// Certifications section), so a file with the old certification_date column is
// refused rather than its dates being silently dropped.

export type GatekeeperUploader = 'super_admin' | 'champion'

export const GATEKEEPER_CSV_COLUMNS: Record<GatekeeperUploader, string[]> = {
  super_admin: ['full_name', 'email', 'phone', 'club_id'],
  champion: ['full_name', 'email', 'phone'],
}

export const RETIRED_CERTIFICATION_DATE_MESSAGE =
  'Remove the certification_date column. Certifications are no longer added during registration: add them from each person’s Certifications section after they’re registered.'

export function gatekeeperCsvHeaderError(header: string[], uploader: GatekeeperUploader): string | null {
  if (header.includes('certification_date')) return RETIRED_CERTIFICATION_DATE_MESSAGE
  const required = GATEKEEPER_CSV_COLUMNS[uploader]
  if (required.every(column => header.includes(column))) return null
  return uploader === 'super_admin'
    ? `CSV header must include: ${required.join(', ')}.`
    : `CSV header must include: ${required.join(', ')} (club_id is optional and ignored).`
}

// A Super Admin's club_id cell may hold the club's ID or its club code
// (e.g. PAN-CA) — nobody knows a club's internal ID offhand. Codes match
// ignoring case. Returns the club ID to use, or an error for the row.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isClubId(cell: string): boolean {
  return UUID_RE.test(cell.trim())
}

export type ClubCodeMatch = { id: string; isActive: boolean }

/** Club codes (lower-cased) → the clubs that have them, with whether each is active. */
export function indexClubCodes(clubs: { id: string; club_code: string | null; is_active: boolean | null }[]): Map<string, ClubCodeMatch[]> {
  const index = new Map<string, ClubCodeMatch[]>()
  for (const club of clubs) {
    const code = club.club_code?.trim().toLowerCase()
    if (!code) continue
    index.set(code, [...(index.get(code) ?? []), { id: club.id, isActive: club.is_active === true }])
  }
  return index
}

// When a code matches several clubs, the single active one wins (old,
// deactivated clubs can share a code with the club that replaced it). Only
// several *active* matches are ambiguous. If every match is inactive, the
// first is used and the later club check reports it as inactive.
export function resolveClubCell(cell: string | undefined, codes: Map<string, ClubCodeMatch[]>): { clubId: string } | { error: string } {
  const value = (cell ?? '').trim()
  if (!value || isClubId(value)) return { clubId: value }
  const matches = codes.get(value.toLowerCase()) ?? []
  if (!matches.length) return { error: `No club has the code "${value}". Check the club code (e.g. PAN-CA) or use the club's ID.` }
  if (matches.length === 1) return { clubId: matches[0].id }
  const active = matches.filter(m => m.isActive)
  if (active.length > 1) return { error: `More than one club has the code "${value}". Use the club's ID instead.` }
  return { clubId: (active[0] ?? matches[0]).id }
}
