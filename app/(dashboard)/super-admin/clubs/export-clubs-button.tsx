'use client'

import { downloadCsv } from '@/lib/csv-download'

export type ExportRow = {
  name: string
  club_code: string | null
  location: string
  is_active: boolean
  gatekeepers: number
  champions: string
  certified_pct: number | null
}

/** The export's rows. Written out by the shared, formula-safe CSV helper (Review Finding 13b). */
export function clubsCsvRows(rows: ExportRow[]): (string | number)[][] {
  return [
    ['Club Name', 'Club Code', 'Location', 'Status', 'Gatekeepers', 'Assigned Champions', 'Certification Readiness (%)'],
    ...rows.map(r => [
      r.name,
      r.club_code ?? '',
      r.location,
      r.is_active ? 'Active' : 'Inactive',
      r.gatekeepers,
      r.champions,
      r.certified_pct === null ? '' : r.certified_pct,
    ]),
  ]
}

// Client-side CSV export of the club rows currently displayed on the page —
// no server round-trip, no fabricated feature (real data already fetched).
export function ExportClubsButton({ rows }: { rows: ExportRow[] }) {
  const handleExport = () =>
    downloadCsv(`clubs-export-${new Date().toISOString().split('T')[0]}.csv`, clubsCsvRows(rows))

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
