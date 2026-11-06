'use client'

export type ExportRow = {
  name: string
  club_code: string | null
  location: string
  is_active: boolean
  gatekeepers: number
  champions: string
  certified_pct: number | null
}

function toCsv(rows: ExportRow[]): string {
  const header = ['Club Name', 'Club Code', 'Location', 'Status', 'Gatekeepers', 'Assigned Champions', 'Certification Readiness (%)']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [header.map(escape).join(',')]
  for (const r of rows) {
    lines.push([
      r.name,
      r.club_code ?? '',
      r.location,
      r.is_active ? 'Active' : 'Inactive',
      String(r.gatekeepers),
      r.champions,
      r.certified_pct === null ? '' : String(r.certified_pct),
    ].map(escape).join(','))
  }
  return lines.join('\n')
}

// Client-side CSV export of the club rows currently displayed on the page —
// no server round-trip, no fabricated feature (real data already fetched).
export function ExportClubsButton({ rows }: { rows: ExportRow[] }) {
  const handleExport = () => {
    const csv = toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clubs-export-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
