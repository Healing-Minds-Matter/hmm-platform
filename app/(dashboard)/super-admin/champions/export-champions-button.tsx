'use client'

import { downloadCsv } from '@/lib/csv-download'

export type ExportRow = {
  full_name: string
  email: string
  phone: string | null
  title: string | null
  club_name: string
  gatekeepers: number
  is_active: boolean
}

/** The export's rows. Written out by the shared, formula-safe CSV helper (Review Finding 13b). */
export function championsCsvRows(rows: ExportRow[]): (string | number)[][] {
  return [
    ['Full Name', 'Email', 'Phone', 'Title', 'Assigned Club', 'Gatekeepers in Club', 'Status'],
    ...rows.map(r => [
      r.full_name,
      r.email,
      r.phone ?? '',
      r.title ?? '',
      r.club_name,
      r.gatekeepers,
      r.is_active ? 'Active' : 'Inactive',
    ]),
  ]
}

// Client-side CSV export of the champion rows currently displayed on the
// page — no server round-trip, no fabricated feature (real data already
// fetched), same pattern as export-clubs-button.tsx.
export function ExportChampionsButton({ rows }: { rows: ExportRow[] }) {
  const handleExport = () =>
    downloadCsv(`champions-export-${new Date().toISOString().split('T')[0]}.csv`, championsCsvRows(rows))

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-[17px] py-[9px] text-[12px] font-semibold tracking-[0.24px] text-[#0F172A] shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/export.svg" alt="" width={12} height={12} />
      Export
    </button>
  )
}
