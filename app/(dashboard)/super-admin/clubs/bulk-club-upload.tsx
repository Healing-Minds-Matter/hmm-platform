'use client'

import { useActionState, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { createClubsBulkAction } from '@/actions/clubs'
import { CsvDropZone } from '@/components/csv-drop-zone'
import { CLUB_CSV_COLUMNS } from '@/lib/club-rules'

const code = 'rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]'

// "Bulk CSV Upload" tab of the Create New Club modal. Mirrors the Gatekeeper
// bulk upload: rows are independent, and the per-row results stay on screen
// (no auto-close) so failed rows can be fixed and uploaded again.
export function BulkClubUpload({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(createClubsBulkAction, null)
  const submit = useSubmitWithoutReset(formAction)
  const [fileName, setFileName] = useState<string | null>(null)

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
        {state?.error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>
        )}

        <div className="flex flex-col gap-3 rounded-xl bg-white p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">CSV Format</h2>
          <p className="text-[12px] leading-[18px] text-[#475569]">
            Header row required, exactly: <code className={code}>{CLUB_CSV_COLUMNS.join(',')}</code>
            <br />
            <code className={code}>name</code>, <code className={code}>code</code> and <code className={code}>address</code> are
            required; the rest can be left empty. Names and codes must be unique. Put quotes around any value that
            contains a comma, e.g. <code className={code}>&quot;12 Galle Rd, Colombo 03&quot;</code>. Phone numbers without a
            country code are treated as Sri Lankan. Every club is created as Active.
          </p>
          <CsvDropZone fileName={fileName} onFile={f => setFileName(f?.name ?? null)} />
        </div>

        {/* Announced to screen readers when the upload finishes. */}
        <div role="status" aria-live="polite">
          {state?.results && state.results.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-white p-5">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                Results — {state.createdCount} created, {state.failedCount} failed
              </h2>
              <ul className="flex flex-col gap-1">
                {state.results.map(r => (
                  <li key={r.row} className={`flex gap-2 text-[12px] ${r.success ? 'text-[#0D8275]' : 'text-[#DC2626]'}`}>
                    <span className="shrink-0 font-mono">Row {r.row}</span>
                    <span className="shrink-0 font-medium">{r.name}</span>
                    <span>{r.success ? '✓ Created' : `✗ ${r.error}`}</span>
                  </li>
                ))}
              </ul>
              {!!state.failedCount && (
                <p className="text-[12px] text-[#475569]">
                  Fix the failed rows and upload a file with just those rows. Clubs already created won&apos;t be added twice.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
        <button type="button" onClick={onClose} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
          {state?.results ? 'Close' : 'Cancel'}
        </button>
        <button
          type="submit" disabled={isPending || !fileName}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
        >
          {isPending ? 'Uploading…' : 'Upload & Register'}
        </button>
      </div>
    </form>
  )
}
