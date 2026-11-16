import { toCsv } from '@/lib/csv'

// Every CSV the portal lets people download goes through here (Review
// Finding 13b): cells are made formula-safe by toCsv/csvCell. The byte-order
// mark makes Excel read Sinhala and Tamil text correctly.
export function downloadCsv(fileName: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
