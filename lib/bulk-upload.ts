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
} | null

export const bulkIntent = (formData: FormData): BulkIntent =>
  formData.get('intent') === 'save' ? 'save' : 'check'

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
