'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { certificationDateInputProps } from '@/lib/certification-date'
import { createGatekeeperAction, createGatekeepersBulkAction } from '@/actions/gatekeepers'

interface Club { id: string; name: string; club_code: string | null }
interface Champion { id: string; full_name: string; club_id: string | null }

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (Primary)' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
]

function threeYearsLabel(dateStr: string): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setUTCFullYear(d.getUTCFullYear() + 3)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function CsvDropZone({ fileName, onFile }: { fileName: string | null; onFile: (file: File | null) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file && inputRef.current) {
          const dt = new DataTransfer()
          dt.items.add(file)
          inputRef.current.files = dt.files
          onFile(file)
        }
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl p-6 text-center transition-colors ${
        isDragging ? 'bg-[#EFF4FF] ring-2 ring-[#1E4BB8]' : 'bg-[#F8FAFC] hover:bg-slate-100'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        name="csv_file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={e => onFile(e.target.files?.[0] ?? null)}
      />
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cloud-upload.svg" alt="" width={18.33} height={13.33} />
      </span>
      <p className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
        {fileName ?? 'Drag & drop a CSV file, or click to browse'}
      </p>
      <p className="text-[11px] text-[#64748B]">Up to 50 rows per upload</p>
    </div>
  )
}

// Shared by both Super Admin (/super-admin/gatekeepers/new) and Champion
// (/champion/gatekeepers/new) — per explicit request, reused rather than
// forked into a second parallel implementation. Role scoping is real,
// not just cosmetic: for `scope.mode === 'fixed'` (Champion), no club_id
// input is ever rendered or submitted at all, so there's nothing for a
// Champion to tamper with client-side — resolveScopedClubId on the
// server (actions/gatekeepers.ts) ignores any club_id for a Champion
// caller and always forces their own club regardless, same as before
// this component was shared. Super Admin (`scope.mode === 'select'`)
// keeps its full club-picker + linked-champion display, unchanged.
type ClubScope =
  | { mode: 'select'; clubs: Club[]; champions: Champion[] }
  | { mode: 'fixed'; clubName: string }

export function CreateGatekeeperForm({
  scope,
  redirectPath,
  onClose,
}: {
  scope: ClubScope
  redirectPath: string
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(redirectPath))
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  const [singleState, singleAction, singlePending] = useActionState(createGatekeeperAction, null)
  const [bulkState, bulkAction, bulkPending] = useActionState(createGatekeepersBulkAction, null)
  const submitSingle = useSubmitWithoutReset(singleAction)
  const submitBulk = useSubmitWithoutReset(bulkAction)

  const [email, setEmail] = useState('')
  const [clubId, setClubId] = useState('')
  const [certDate, setCertDate] = useState('')
  const [csvFileName, setCsvFileName] = useState<string | null>(null)

  const linkedChampion = scope.mode === 'select' ? scope.champions.find(c => c.club_id === clubId) ?? null : null
  const expiryLabel = threeYearsLabel(certDate)

  useEffect(() => {
    // When the welcome email was skipped, tempPassword comes back so it
    // can be shown once on screen — the account only ever has that
    // temp password shared this one way in that case, so this can't
    // auto-close like the emailed path does.
    if (singleState?.success && !singleState.tempPassword) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleState])

  // Bulk has no auto-close at all — the per-row results table (including
  // any skipped-email temp passwords) is the useful output to review,
  // not something to dismiss immediately on success.

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 text-[#0F172A]">Add New Gatekeeper</h1>
          <p className="max-w-[480px] text-[12px] leading-4 text-[#64748B]">
            Onboard a certified QPR community gatekeeper to {scope.mode === 'fixed' ? scope.clubName : 'a regional club'}.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 px-6 pb-3">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
            mode === 'single' ? 'border-[#E5E7EB] bg-white text-[#003495] shadow-sm' : 'border-transparent text-[#64748B] hover:bg-slate-50'
          }`}
        >
          Single Gatekeeper
        </button>
        <button
          type="button"
          onClick={() => setMode('bulk')}
          className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
            mode === 'bulk' ? 'border-[#E5E7EB] bg-white text-[#003495] shadow-sm' : 'border-transparent text-[#64748B] hover:bg-slate-50'
          }`}
        >
          Bulk CSV Upload
          <span className="rounded bg-[#E6EEFF] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">Up to 50</span>
        </button>
      </div>

      {mode === 'single' && singleState?.success && singleState.tempPassword ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
            <p className="text-[13px] text-[#0F172A]">
              Gatekeeper registered. Share these credentials with them yourself — this password is shown only
              once and isn&apos;t emailed.
            </p>
            <div className="flex flex-col gap-2 rounded-xl bg-[#F8FAFC] p-4 text-[13px]">
              <div><span className="text-[#64748B]">Email: </span><span className="font-mono">{email}</span></div>
              <div><span className="text-[#64748B]">Temporary password: </span><span className="font-mono font-semibold">{singleState.tempPassword}</span></div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
            <button type="button" onClick={close} className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E09B0F]">
              Done
            </button>
          </div>
        </div>
      ) : mode === 'single' ? (
        <form onSubmit={submitSingle} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
            {singleState?.error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{singleState.error}</div>
            )}

            <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
              <h2 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                Personal Details
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="full_name" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Full Name <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    id="full_name" name="full_name" type="text" required autoComplete="off"
                    placeholder="e.g. Maya Lin"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Email Address <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    id="email" name="email" type="email" required autoComplete="off"
                    placeholder="maya.lin@northridge.edu"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Phone Number <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    id="phone" name="phone" type="tel" required autoComplete="off"
                    placeholder="+1 (555) 234-5678"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <div>
                  <label htmlFor="preferred_language" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Preferred Language
                  </label>
                  <div className="relative">
                    <select
                      id="preferred_language" name="preferred_language" defaultValue="en"
                      className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                    >
                      {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
                  </div>
                </div>
              </div>

              {scope.mode === 'select' ? (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Club Assignment &amp; Mentorship</h2>
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]">1 Club per Gatekeeper</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="club_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                        Assigned Regional Club <span className="text-[#DC2626]">*</span>
                      </label>
                      {scope.clubs.length === 0 ? (
                        <p className="text-[13px] text-[#DC2626]">No active clubs available.</p>
                      ) : (
                        <div className="relative">
                          <select
                            id="club_id" name="club_id" required value={clubId} onChange={e => setClubId(e.target.value)}
                            className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                          >
                            <option value="" disabled>Select an active club...</option>
                            {scope.clubs.map(c => (
                              <option key={c.id} value={c.id}>{c.name}{c.club_code ? ` (${c.club_code})` : ''}</option>
                            ))}
                          </select>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">Linked Club Lead Champion</label>
                      <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#EFF4FF] px-3">
                        {linkedChampion ? (
                          <>
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#1E4BB8] text-[10px] font-semibold text-white">
                              {linkedChampion.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </span>
                            <span className="truncate text-[13px] font-semibold text-[#0F172A]">{linkedChampion.full_name}</span>
                          </>
                        ) : (
                          <span className="text-[13px] text-[#64748B]">{clubId ? 'No active champion assigned' : 'Select a club first'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Club Assignment</h2>
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#EFF4FF] px-3.5">
                    <span className="text-[13px] font-semibold text-[#0F172A]">{scope.clubName}</span>
                    <span className="ml-auto text-[11px] text-[#64748B]">Your club</span>
                  </div>
                </>
              )}

              <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">QPR Certification &amp; Lifecycle Details</h2>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="certification_date" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                      Certification Date <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      id="certification_date" name="certification_date" type="date" required {...certificationDateInputProps()}
                      value={certDate} onChange={e => setCertDate(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">System Gatekeeper ID</label>
                    <div className="flex h-10 items-center justify-between rounded-lg border border-[#E5E7EB] bg-white px-3">
                      <span className="font-mono text-[13px] font-bold text-[#003495]">GK-••••</span>
                      <span className="text-[12px] text-[#64748B]">Auto-generated</span>
                    </div>
                  </div>
                </div>
                {expiryLabel && (
                  <div className="mt-3 rounded-lg bg-[rgba(13,130,117,0.1)] px-3 py-1.5 text-[12px] font-medium text-[#0D8275]">
                    Active for 3 Years • Valid until {expiryLabel}
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl bg-[rgba(220,233,255,0.6)] p-3">
              <input type="checkbox" name="send_welcome_email" defaultChecked className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[#D4D7E3]" />
              <span className="text-[12px] leading-[16.5px] text-[#475569]">
                Send a welcome email now, with real login credentials. Uncheck this to share the temporary password
                with the Gatekeeper yourself instead — it'll be shown once on screen after you register them.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
            <button type="button" onClick={close} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
              Cancel
            </button>
            <button
              type="submit" disabled={singlePending || (scope.mode === 'select' && scope.clubs.length === 0)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
            >
              {!singlePending && <img src="/icons/plus.svg" alt="" width={10.5} height={10.5} />}
              {singlePending ? 'Registering…' : 'Register Gatekeeper'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitBulk} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
            {bulkState?.error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{bulkState.error}</div>
            )}

            <div className="flex flex-col gap-3 rounded-xl bg-white p-5">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">CSV Format</h2>
              {scope.mode === 'select' ? (
                <>
                  <p className="text-[12px] leading-[18px] text-[#475569]">
                    Header row required, exactly: <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">full_name,email,phone,club_id,certification_date</code>
                    <br />
                    <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">club_id</code> must be a real club&apos;s internal ID. <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">certification_date</code> as YYYY-MM-DD, not in the future. Every row needs its own <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">phone</code> number.
                  </p>
                  <details className="text-[12px] text-[#475569]">
                    <summary className="cursor-pointer font-semibold text-[#003495]">Active club IDs</summary>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {scope.clubs.map(c => (
                        <li key={c.id} className="font-mono text-[11px]">{c.id} — {c.name}</li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p className="text-[12px] leading-[18px] text-[#475569]">
                  Header row required, exactly: <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">full_name,email,phone,certification_date</code>
                  <br />
                  All rows are added to <strong>{scope.clubName}</strong>. <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">certification_date</code> as YYYY-MM-DD, not in the future. Every row needs its own <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]">phone</code> number.
                </p>
              )}
              <CsvDropZone fileName={csvFileName} onFile={f => setCsvFileName(f?.name ?? null)} />
            </div>

            <label className="flex items-center gap-2 rounded-xl bg-white p-4 text-[13px] text-[#0F172A]">
              <input type="checkbox" name="send_welcome_email" defaultChecked className="h-4 w-4 rounded border-[#D4D7E3]" />
              Send welcome email now (applies to every row) — uncheck to share each temp password manually instead
            </label>

            {bulkState?.results && bulkState.results.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl bg-white p-5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                  Results — {bulkState.createdCount} of {bulkState.results.length} created
                </h2>
                <ul className="flex flex-col gap-1">
                  {bulkState.results.map(r => (
                    <li key={r.row} className="flex flex-col gap-0.5 text-[12px]">
                      <div className={`flex items-center gap-2 ${r.success ? 'text-[#0D8275]' : 'text-[#DC2626]'}`}>
                        <span className="font-mono">Row {r.row}</span>
                        <span>{r.email}</span>
                        <span>{r.success ? '✓ Created' : `✗ ${r.error}`}</span>
                      </div>
                      {r.tempPassword && (
                        <div className="ml-6 flex items-center gap-1.5 text-[#0F172A]">
                          <span className="text-[11px] text-[#64748B]">Temp password (share manually — shown only once):</span>
                          <span className="font-mono font-semibold">{r.tempPassword}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
            <button type="button" onClick={close} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
              {bulkState?.results ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit" disabled={bulkPending || !csvFileName}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
            >
              {bulkPending ? 'Uploading…' : 'Upload & Register'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
