// Shared shapes for the two-step bulk CSV uploads (Gatekeepers, Clubs):
//   1. "check"  — every row is validated, nothing is saved; the screen shows
//                 which rows are ready and what's wrong with the others.
//   2. "save"   — the rows are validated again (something may have changed
//                 since the check) and the ones that pass are saved; failed
//                 rows are skipped.
// Safe to import from client and server code.

export type BulkIntent = 'check' | 'save'

export type BulkRowResult = {
  row: number // line in the file
  label: string // what the row is called on screen (club name, email)
  status: 'ready' | 'created' | 'failed'
  error?: string
  // Gatekeepers registered without a welcome email: shown once, never stored.
  tempPassword?: string
}

export type BulkUploadState = {
  error?: string // the whole file was rejected; nothing was checked or saved
  intent?: BulkIntent
  results?: BulkRowResult[]
  // Set by the screen when a batch failed part-way: rows in earlier batches
  // were handled, the rest weren't.
  stopped?: string
} | null

export const bulkIntent = (formData: FormData): BulkIntent =>
  formData.get('intent') === 'save' ? 'save' : 'check'

// Each request handles only a few rows, so no single request runs long
// enough to hit the hosting time limit (on the live site a Gatekeeper takes
// ~6s to register: login, ID, audit, email). The screen sends the whole file
// every time plus the line numbers to handle, in a "lines" field, and shows
// progress between batches. Checking still looks at every row for
// duplicates within the file, but only reports on the batch's rows.
export const BULK_BATCH_SIZE = { gatekeepers: 5, clubs: 10 } as const

// The batch's line numbers, or null to handle every row (no "lines" field).
export function batchLines(formData: FormData): Set<number> | null {
  const raw = formData.get('lines')
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return new Set(raw.split(',').map(Number).filter(Number.isInteger))
}

export function planBatches(lines: number[], size: number): number[][] {
  const batches: number[][] = []
  for (let i = 0; i < lines.length; i += size) batches.push(lines.slice(i, i + size))
  return batches
}

export function countBulkResults(results: BulkRowResult[]) {
  return {
    ready: results.filter(r => r.status === 'ready').length,
    created: results.filter(r => r.status === 'created').length,
    failed: results.filter(r => r.status === 'failed').length,
  }
}

// A last column with this name is ignored by both uploads, so the "Download
// failed rows" file (which explains each problem there) can be fixed and
// uploaded straight back.
export const PROBLEM_COLUMN = 'problem'
