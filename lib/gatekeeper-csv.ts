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
