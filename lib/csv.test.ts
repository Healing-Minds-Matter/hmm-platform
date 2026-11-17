import { describe, expect, it } from 'vitest'
import { BULK_UPLOAD_MAX_ROWS, csvCell, parseCsv, readCsvUpload, toCsv } from '@/lib/csv'

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

describe('toCsv', () => {
  it('quotes only cells that need it, and parseCsv reads the result back', () => {
    const rows = [
      ['name', 'address', 'problem'],
      ['Club A', '12 Galle Rd, Colombo 03', 'Club code "A-1" is already taken.'],
      ['Club B', 'Kandy', 'line one\nline two'],
    ]
    const text = toCsv(rows)
    expect(text.split('\r\n')[1]).toBe('Club A,"12 Galle Rd, Colombo 03","Club code ""A-1"" is already taken."')
    expect(parseCsv(text).map(r => r.cells)).toEqual(rows)
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

// Review Finding 13b: spreadsheet formula injection.
describe('csvCell / toCsv: cells can never run as a formula', () => {
  it.each([
    ['=HYPERLINK("http://evil.example","Click")', `"'=HYPERLINK(""http://evil.example"",""Click"")"`],
    ['+94 77 123 4567', "'+94 77 123 4567"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', `"'\r=1+1"`],
    ['=cmd|\' /C calc\'!A0', "'=cmd|' /C calc'!A0"],
  ])('%j → %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected)
  })

  it('ordinary values are unchanged; commas, quotes and line breaks are quoted', () => {
    expect(csvCell('Asha Silva')).toBe('Asha Silva')
    expect(csvCell('Colombo, 03')).toBe('"Colombo, 03"')
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""')
    expect(csvCell(12)).toBe('12')
    expect(csvCell(null)).toBe('')
    expect(csvCell("O'Neil")).toBe("O'Neil")
  })

  it('a file we produced reads back to the original values when uploaded again', () => {
    const rows = [['full_name', 'phone'], ['=1+1', '+94 77 123 4567'], ['@x', '-5']]
    expect(parseCsv(toCsv(rows)).map(r => r.cells)).toEqual(rows)
  })
})

describe('every CSV export uses the safe writer', () => {
  it('Champions export', async () => {
    const { championsCsvRows } = await import('@/app/(dashboard)/super-admin/champions/export-champions-button')
    const text = toCsv(championsCsvRows([{
      full_name: '=HYPERLINK("http://evil.example")', email: 'a@example.com', phone: '+94771234567',
      title: '@admin', club_name: '-Club', gatekeepers: 3, is_active: true,
    }]))
    expect(text.split('\r\n')[1]).toBe(`"'=HYPERLINK(""http://evil.example"")",a@example.com,'+94771234567,'@admin,'-Club,3,Active`)
  })

  it('Clubs export', async () => {
    const { clubsCsvRows } = await import('@/app/(dashboard)/super-admin/clubs/export-clubs-button')
    const text = toCsv(clubsCsvRows([{
      name: '=1+1', club_code: '+C1', location: '@Kandy', is_active: false, gatekeepers: 0, champions: '-A', certified_pct: null,
    }]))
    expect(text.split('\r\n')[1]).toBe("'=1+1,'+C1,'@Kandy,Inactive,0,'-A,")
  })

  it('no other code builds a CSV file by hand', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
    })
    const offending = ['app', 'components', 'lib', 'actions'].flatMap(files)
      .filter(p => !/lib[\\/]csv(-download)?\.ts$/.test(p))
      .filter(p => /text\/csv/.test(readFileSync(p, 'utf8')) && /new Blob/.test(readFileSync(p, 'utf8')))
    expect(offending).toEqual([])
  })
})
