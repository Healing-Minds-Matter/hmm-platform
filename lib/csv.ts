// Shared CSV reading for the bulk uploads (Gatekeepers, Clubs).
//
// Handles what spreadsheet exports actually contain: quoted cells with commas
// or line breaks inside ("12 Galle Rd, Colombo 03"), "" for a literal quote,
// CRLF line endings, and the byte-order mark Excel puts at the start of a
// "CSV UTF-8" file (which otherwise makes the first header never match).

export const BULK_UPLOAD_MAX_ROWS = 50

export type CsvRow = {
  line: number // line in the file where this row starts (1 = header)
  cells: string[]
}

// Every row, including the header. Blank lines are skipped; each cell is
// trimmed.
export function parseCsv(text: string): CsvRow[] {
  const input = text.replace(/^﻿/, '')
  const rows: CsvRow[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let rowStartLine = 1

  const endRow = () => {
    cells.push(cell)
    if (cells.some(c => c.trim() !== '')) {
      rows.push({ line: rowStartLine, cells: cells.map(c => unprotectCell(c.trim())) })
    }
    cells = []
    cell = ''
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else {
        if (ch === '\n') line++
        cell += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') { cells.push(cell); cell = '' }
    else if (ch === '\r') continue
    else if (ch === '\n') { endRow(); line++; rowStartLine = line }
    else cell += ch
  }
  endRow()
  return rows
}

// Review Finding 13b: a cell that starts with = + - @ (or a tab or carriage
// return) is run as a formula by Excel, Google Sheets and LibreOffice — a
// name typed as =HYPERLINK(…) or =cmd|… would run on the reader's computer.
// Such cells get a leading single quote, so they open as plain text.
const FORMULA_START = /^[=+\-@\t\r]/

/** One CSV cell: formula-safe, and quoted when it holds a comma, quote or line break. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// The reverse of parseCsv: every cell through csvCell, so the file opens
// safely and correctly in Excel and can be uploaded again.
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/**
 * Undoes csvCell's protective quote when a file we produced is uploaded
 * again (e.g. a fixed "failed rows" file): "'+94 77…" → "+94 77…".
 */
export function unprotectCell(cell: string): string {
  return /^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell
}

export type CsvUpload = { header: string[]; rows: CsvRow[] }

// Reads an uploaded file and applies the checks every bulk upload shares.
// Header names come back lower-cased.
export async function readCsvUpload(file: File | null): Promise<CsvUpload | { error: string }> {
  if (!file || file.size === 0) return { error: 'Select a CSV file to upload.' }

  const rows = parseCsv(await file.text())
  if (rows.length === 0) return { error: 'The CSV file is empty.' }

  const header = rows[0].cells.map(h => h.toLowerCase())
  const dataRows = rows.slice(1)
  if (dataRows.length === 0) return { error: 'The CSV file has no data rows.' }
  if (dataRows.length > BULK_UPLOAD_MAX_ROWS) {
    return { error: `The CSV has ${dataRows.length} rows — maximum is ${BULK_UPLOAD_MAX_ROWS} per upload.` }
  }
  return { header, rows: dataRows }
}
