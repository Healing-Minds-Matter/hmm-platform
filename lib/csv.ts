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
      rows.push({ line: rowStartLine, cells: cells.map(c => c.trim()) })
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

// The reverse of parseCsv: quotes any cell containing a comma, quote or line
// break, so the file opens correctly in Excel and can be uploaded again.
export function toCsv(rows: string[][]): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
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
