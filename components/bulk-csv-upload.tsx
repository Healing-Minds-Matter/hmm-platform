'use client'

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from 'react'
import { CsvDropZone } from '@/components/csv-drop-zone'
import { parseCsv, toCsv } from '@/lib/csv'
import { PROBLEM_COLUMN, countBulkResults, type BulkIntent, type BulkRowResult, type BulkUploadState } from '@/lib/bulk-upload'

type Props = {
  action: (prev: BulkUploadState, formData: FormData) => Promise<BulkUploadState>
  noun: { one: string; many: string } // e.g. club / clubs
  formatHelp: ReactNode
  template: { fileName: string; rows: string[][] }
  checkHeader: (header: string[]) => string | null
  options?: ReactNode // extra form fields that apply when saving
  onClose: () => void
}

// The "Bulk CSV Upload" tab of the Add Gatekeeper and Create New Club modals.
// Steps: choose a file (its header is checked at once) → "Check file" shows
// every row as ready or with its problem, saving nothing → "Register N" saves
// the ready rows and skips the rest → results, with the failed rows as a
// download to fix and upload again. "Upload another file" starts over.
export function BulkCsvUpload(props: Props) {
  const [attempt, setAttempt] = useState(0)
  return <BulkCsvUploadSteps key={attempt} {...props} onRestart={() => setAttempt(a => a + 1)} />
}

const code = 'rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]'
const plural = (n: number, noun: { one: string; many: string }) => `${n} ${n === 1 ? noun.one : noun.many}`
const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`

function downloadCsv(fileName: string, csvRows: string[][]) {
  // The byte-order mark makes Excel read Sinhala and Tamil text correctly.
  const blob = new Blob(['﻿', toCsv(csvRows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

// The uploaded file's own rows that failed, with a "problem" column saying
// why. Both uploads ignore that column, so the fixed file can go straight back.
async function downloadFailedRows(file: File, results: BulkRowResult[], fileName: string) {
  const problems = new Map(results.filter(r => r.status === 'failed').map(r => [r.row, r.error ?? '']))
  const [header, ...dataRows] = parseCsv(await file.text())
  const withoutProblem = (cells: string[]) =>
    header.cells[header.cells.length - 1]?.toLowerCase() === PROBLEM_COLUMN ? cells.slice(0, header.cells.length - 1) : cells
  downloadCsv(fileName, [
    [...withoutProblem(header.cells), PROBLEM_COLUMN],
    ...dataRows.filter(r => problems.has(r.line)).map(r => [...withoutProblem(r.cells), problems.get(r.line)!]),
  ])
}

function BulkCsvUploadSteps({ action, noun, formatHelp, template, checkHeader, options, onClose, onRestart }: Props & { onRestart: () => void }) {
  const [state, formAction, isPending] = useActionState(action, null)
  const [file, setFile] = useState<File | null>(null)
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [pendingIntent, setPendingIntent] = useState<BulkIntent>('check')

  const step = state?.results ? (state.intent === 'save' ? 'done' : 'preview') : 'choose'
  const counts = countBulkResults(state?.results ?? [])

  const chooseFile = async (chosen: File | null) => {
    setFile(chosen)
    setHeaderError(null)
    if (!chosen) return
    const [header] = parseCsv(await chosen.text())
    setHeaderError(header ? checkHeader(header.cells.map(h => h.toLowerCase())) : 'The CSV file is empty.')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    // The file picker isn't on screen after the check, so send the file itself.
    if (file) formData.set('csv_file', file)
    setPendingIntent(formData.get('intent') === 'save' ? 'save' : 'check')
    startTransition(() => formAction(formData))
  }

  const failedFileName = `${noun.many}-failed-rows.csv`

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
        {state?.error && step === 'choose' && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>
        )}

        {step === 'choose' ? (
          <div className="flex flex-col gap-3 rounded-xl bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">CSV Format</h2>
              <button
                type="button"
                onClick={() => downloadCsv(template.fileName, template.rows)}
                className="text-[12px] font-semibold text-[#003495] underline-offset-2 hover:underline"
              >
                Download template
              </button>
            </div>
            {formatHelp}
            <CsvDropZone fileName={file?.name ?? null} onFile={chooseFile} />
            {headerError && <p className="text-[12px] text-[#DC2626]" role="alert">{headerError}</p>}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-[#0F172A]">{file?.name}</span>
            {step === 'preview' && (
              <button type="button" onClick={onRestart} className="shrink-0 text-[12px] font-semibold text-[#003495] underline-offset-2 hover:underline">
                Change file
              </button>
            )}
          </div>
        )}

        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          {step !== 'choose' && state?.results && (
            <div className="flex flex-col gap-2 rounded-xl bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#0F172A]">
                {step === 'preview'
                  ? counts.failed === 0
                    ? `All ${rows(counts.ready)} are ready to register.`
                    : `${rows(counts.ready)} ready. ${rows(counts.failed)} ${counts.failed === 1 ? 'has a problem' : 'have problems'} and will be skipped.`
                  : `${plural(counts.created, noun)} registered${counts.failed ? `, ${counts.failed} failed` : ''}.`}
              </h2>
              {step === 'preview' && counts.ready === 0 && (
                <p className="text-[12px] text-[#475569]">Nothing can be registered yet. Fix the problems below, then choose the file again.</p>
              )}
              <ResultList results={state.results} />
              {step === 'done' && counts.failed > 0 && (
                <p className="text-[12px] text-[#475569]">
                  Download the failed rows: the last column, <code className={code}>{PROBLEM_COLUMN}</code>, explains each one. Fix
                  them and upload that file. Rows already registered aren&apos;t in it.
                </p>
              )}
            </div>
          )}
        </div>

        {step === 'preview' && counts.ready > 0 && options}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
        {step === 'done' ? (
          <>
            {counts.failed > 0 && file && (
              <button type="button" onClick={() => downloadFailedRows(file, state!.results!, failedFileName)} className="mr-auto text-[13px] font-semibold text-[#003495] underline-offset-2 hover:underline">
                Download failed rows
              </button>
            )}
            <button type="button" onClick={onRestart} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
              Upload another file
            </button>
            <button type="button" onClick={onClose} className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E09B0F]">
              Close
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
              Cancel
            </button>
            {step === 'choose' ? (
              <button
                type="submit" name="intent" value="check" disabled={isPending || !file || !!headerError}
                className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
              >
                {isPending ? 'Checking…' : 'Check file'}
              </button>
            ) : counts.ready > 0 ? (
              <button
                type="submit" name="intent" value="save" disabled={isPending}
                className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
              >
                {isPending && pendingIntent === 'save' ? 'Registering…' : `Register ${plural(counts.ready, noun)}`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </form>
  )
}

function ResultList({ results }: { results: BulkRowResult[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {results.map(r => (
        <li key={r.row} className="flex flex-col gap-0.5 text-[12px]">
          <div className={`flex gap-2 ${r.status === 'failed' ? 'text-[#DC2626]' : 'text-[#0D8275]'}`}>
            <span className="shrink-0 font-mono">Row {r.row}</span>
            <span className="shrink-0 font-medium">{r.label}</span>
            <span>{r.status === 'ready' ? 'Ready' : r.status === 'created' ? '✓ Created' : `✗ ${r.error}`}</span>
          </div>
          {r.tempPassword && (
            <div className="ml-6 flex flex-wrap items-center gap-1.5 text-[#0F172A]">
              <span className="text-[11px] text-[#64748B]">Temp password (share manually — shown only once):</span>
              <span className="font-mono font-semibold">{r.tempPassword}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
