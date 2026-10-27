// Header rule for the Gatekeeper bulk CSV upload, shared by the upload
// screen (checked as soon as a file is chosen) and the server action.
// Column order doesn't matter and extra columns are ignored. A Champion's
// rows always go to their own club, so club_id is optional for them.

export type GatekeeperUploader = 'super_admin' | 'champion'

export const GATEKEEPER_CSV_COLUMNS: Record<GatekeeperUploader, string[]> = {
  super_admin: ['full_name', 'email', 'phone', 'club_id', 'certification_date'],
  champion: ['full_name', 'email', 'phone', 'certification_date'],
}

export function gatekeeperCsvHeaderError(header: string[], uploader: GatekeeperUploader): string | null {
  const required = GATEKEEPER_CSV_COLUMNS[uploader]
  if (required.every(column => header.includes(column))) return null
  return uploader === 'super_admin'
    ? `CSV header must include: ${required.join(', ')}.`
    : `CSV header must include: ${required.join(', ')} (club_id is optional and ignored).`
}
