import { describe, expect, it } from 'vitest'
import { BULK_UPLOAD_MAX_ROWS, parseCsv, readCsvUpload } from '@/lib/csv'

const csvFile = (text: string) => new File([text], 'upload.csv', { type: 'text/csv' })

describe('parseCsv', () => {
  it('splits simple rows and trims cells', () => {
    expect(parseCsv('a, b ,c\n1,2,3')).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['1', '2', '3'] },
    ])
  })

  it('keeps commas inside quoted cells', () => {
    expect(parseCsv('name,address\nLions,"12 Galle Rd, Colombo 03"')[1].cells).toEqual(['Lions', '12 Galle Rd, Colombo 03'])
  })

  it('reads "" inside quotes as a literal quote', () => {
    expect(parseCsv('x\n"The ""Rotaract"" Club"')[1].cells).toEqual(['The "Rotaract" Club'])
  })

  it('allows line breaks inside quoted cells and reports the starting line', () => {
    const rows = parseCsv('a,b\n"line one\nline two",x\nnext,row')
    expect(rows[1]).toEqual({ line: 2, cells: ['line one\nline two', 'x'] })
    expect(rows[2]).toEqual({ line: 4, cells: ['next', 'row'] })
  })

  it('ignores blank lines but keeps real file line numbers', () => {
    expect(parseCsv('h\n\nfirst\n  \n,\nsecond\n').map(r => r.line)).toEqual([1, 3, 6])
  })

  it('handles Windows line endings and an Excel byte-order mark', () => {
    expect(parseCsv('﻿name,code\r\nA,B\r\n')).toEqual([
      { line: 1, cells: ['name', 'code'] },
      { line: 2, cells: ['A', 'B'] },
    ])
  })

  it('reads a Gatekeeper upload file the same way as before', () => {
    const text = 'full_name,email,phone,club_id,certification_date\nMaya Lin,maya@example.com,0771234567,abc,2025-01-02'
    expect(parseCsv(text).map(r => r.cells)).toEqual([
      ['full_name', 'email', 'phone', 'club_id', 'certification_date'],
      ['Maya Lin', 'maya@example.com', '0771234567', 'abc', '2025-01-02'],
    ])
  })
})

describe('readCsvUpload', () => {
  it('asks for a file when none was chosen', async () => {
    expect(await readCsvUpload(null)).toEqual({ error: 'Select a CSV file to upload.' })
    expect(await readCsvUpload(csvFile(''))).toEqual({ error: 'Select a CSV file to upload.' })
  })

  it('rejects a file with only blank lines', async () => {
    expect(await readCsvUpload(csvFile('\n\n'))).toEqual({ error: 'The CSV file is empty.' })
  })

  it('rejects a file with a header but no data rows', async () => {
    expect(await readCsvUpload(csvFile('name,code\n'))).toEqual({ error: 'The CSV file has no data rows.' })
  })

  it(`accepts exactly ${BULK_UPLOAD_MAX_ROWS} rows and rejects more`, async () => {
    const rows = (n: number) => 'h\n' + Array.from({ length: n }, (_, i) => `r${i}`).join('\n')
    const ok = await readCsvUpload(csvFile(rows(BULK_UPLOAD_MAX_ROWS)))
    expect('rows' in ok && ok.rows).toHaveLength(BULK_UPLOAD_MAX_ROWS)
    expect(await readCsvUpload(csvFile(rows(BULK_UPLOAD_MAX_ROWS + 1)))).toEqual({
      error: `The CSV has ${BULK_UPLOAD_MAX_ROWS + 1} rows — maximum is ${BULK_UPLOAD_MAX_ROWS} per upload.`,
    })
  })

  it('lower-cases header names', async () => {
    const upload = await readCsvUpload(csvFile('Name,CODE\nA,B'))
    expect('header' in upload && upload.header).toEqual(['name', 'code'])
  })
})
