'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { todayDateString } from '@/lib/org-date'
import { formatCertDate, lastAwardDate } from '@/lib/certification-types'
import { expiryFor } from '@/lib/certificates'
import type { AwardableType } from '@/lib/certifications.server'
import { createGatekeeperAction, createGatekeepersBulkAction } from '@/actions/gatekeepers'
import { BulkCsvUpload } from '@/components/bulk-csv-upload'
import { GATEKEEPER_CSV_COLUMNS, gatekeeperCsvHeaderError } from '@/lib/gatekeeper-csv'
import { BULK_BATCH_SIZE } from '@/lib/bulk-upload'
import { BulkTabLabel, ModeTabs } from '@/components/mode-tabs'

interface Club { id: string; name: string; club_code: string | null }
interface Champion { id: string; full_name: string; club_id: string | null }

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (Primary)' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
]

type CertDraft = { key: number; typeId: string; date: string }

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
  certTypes,
}: {
  scope: ClubScope
  redirectPath: string
  onClose?: () => void
  // Types the user may add (null: no permission to add certifications).
  certTypes: AwardableType[] | null
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(redirectPath))
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  const [singleState, singleAction, singlePending] = useActionState(createGatekeeperAction, null)
  const submitSingle = useSubmitWithoutReset(singleAction)

  const [email, setEmail] = useState('')
  const [clubId, setClubId] = useState('')
  const [certRows, setCertRows] = useState<CertDraft[]>([])
  const today = todayDateString()

  const linkedChampion = scope.mode === 'select' ? scope.champions.find(c => c.club_id === clubId) ?? null : null

  useEffect(() => {
    // When the welcome email was skipped, tempPassword comes back so it
    // can be shown once on screen — the account only ever has that
    // temp password shared this one way in that case, so this can't
    // auto-close like the emailed path does.
    if (singleState?.success && !singleState.tempPassword && !singleState.warning) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleState])

  // Bulk has no auto-close at all — the per-row results (including any
  // skipped-email temp passwords) are the useful output to review, not
  // something to dismiss immediately on success. See BulkCsvUpload.

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 text-[#0F172A]">Add New Gatekeeper</h1>
          <p className="max-w-[480px] text-[12px] leading-4 text-[#64748B]">
            Onboard a QPR community gatekeeper to {scope.mode === 'fixed' ? scope.clubName : 'a regional club'}.
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

      <ModeTabs
        label="How to add gatekeepers"
        idPrefix="add-gatekeeper"
        value={mode}
        onChange={setMode}
        tabs={[
          { value: 'single', label: 'Single Gatekeeper' },
          { value: 'bulk', label: <BulkTabLabel /> },
        ]}
      />

      <div
        id="add-gatekeeper-panel"
        role="tabpanel"
        aria-labelledby={`add-gatekeeper-tab-${mode}`}
        className="flex flex-1 flex-col overflow-hidden"
      >
      {mode === 'single' && singleState?.success && (singleState.tempPassword || singleState.warning) ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
            {singleState.warning && (
              <div className="rounded-lg bg-[#FFFBEB] p-3 text-[13px] text-[#B45309]" role="alert">{singleState.warning}</div>
            )}
            {singleState.tempPassword && (
              <>
                <p className="text-[13px] text-[#0F172A]">
                  Gatekeeper registered. Share these credentials with them yourself — this password is shown only
                  once and isn&apos;t emailed.
                </p>
                <div className="flex flex-col gap-2 rounded-xl bg-[#F8FAFC] p-4 text-[13px]">
                  <div><span className="text-[#64748B]">Email: </span><span className="font-mono">{email}</span></div>
                  <div><span className="text-[#64748B]">Temporary password: </span><span className="font-mono font-semibold">{singleState.tempPassword}</span></div>
                </div>
              </>
            )}
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

              <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] pb-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Certifications</h2>
                <span className="text-[12px] text-[#64748B]">
                  Gatekeeper ID <span className="font-mono font-bold text-[#003495]">GK-••••</span> (auto-generated)
                </span>
              </div>
              {certTypes === null ? (
                <p className="text-[12px] text-[#64748B]">You don&apos;t have permission to add certifications.</p>
              ) : certTypes.length === 0 ? (
                <p className="text-[12px] text-[#64748B]">There are no active certification types yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {certRows.map((row, i) => {
                    const type = certTypes.find(t => t.id === row.typeId)
                    const expiry = type && row.date ? expiryFor(row.date, type.validity_value, type.validity_unit) : null
                    const update = (patch: Partial<CertDraft>) => setCertRows(rows => rows.map(r => (r.key === row.key ? { ...r, ...patch } : r)))
                    return (
                      <div key={row.key} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
                        <div className="grid grid-cols-[minmax(0,1fr)_160px_32px] items-end gap-3">
                          <div>
                            <label htmlFor={`cert_type_${row.key}`} className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">Certification {i + 1}</label>
                            <select
                              id={`cert_type_${row.key}`} name="cert_type_id" value={row.typeId} required
                              onChange={e => update({ typeId: e.target.value })}
                              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                            >
                              <option value="">Choose a type…</option>
                              {certTypes.map(t => (
                                <option key={t.id} value={t.id} disabled={certRows.some(r => r.key !== row.key && r.typeId === t.id)}>
                                  {t.name} ({t.code})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`cert_date_${row.key}`} className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">Date achieved</label>
                            <input
                              id={`cert_date_${row.key}`} name="cert_achieved_on" type="date" required max={lastAwardDate(type, today)} min={type?.offered_from}
                              value={row.date} onChange={e => update({ date: e.target.value })}
                              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                            />
                          </div>
                          <button
                            type="button" aria-label={`Remove certification ${i + 1}`}
                            onClick={() => setCertRows(rows => rows.filter(r => r.key !== row.key))}
                            className="flex h-10 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#E2E8F0]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/x-close.svg" alt="" width={10} height={10} />
                          </button>
                        </div>
                        {type && (type.validity_value == null || expiry) && (
                          <p className="mt-2 text-[12px] font-medium text-[#0D8275]">
                            {type.validity_value == null ? 'Lifetime certificate (no expiry)' : `Valid until ${formatCertDate(expiry)}`}
                          </p>
                        )}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCertRows(rows => [...rows, { key: Date.now(), typeId: '', date: '' }])}
                    disabled={certRows.length >= certTypes.length}
                    className="self-start rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-[13px] font-medium text-[#022C51] hover:bg-[#F1F5F9] disabled:opacity-50"
                  >
                    + Add certification
                  </button>
                  <p className="text-[11px] text-[#94A3B8]">Optional. The format and attachments can be added later from their profile.</p>
                </div>
              )}
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
        <BulkGatekeeperUpload scope={scope} onClose={close} />
      )}
      </div>
    </div>
  )
}

const code = 'rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]'

function BulkGatekeeperUpload({ scope, onClose }: { scope: ClubScope; onClose: () => void }) {
  const uploader = scope.mode === 'select' ? 'super_admin' : 'champion'
  const columns = GATEKEEPER_CSV_COLUMNS[uploader]
  const exampleRow: Record<string, string> = {
    full_name: 'Maya Lin',
    email: 'maya.lin@example.com',
    phone: '077 123 4567',
    club_id: scope.mode === 'select' ? scope.clubs[0]?.id ?? '' : '',
    certification_date: '2025-06-01',
  }

  return (
    <BulkCsvUpload
      action={createGatekeepersBulkAction}
      batchSize={BULK_BATCH_SIZE.gatekeepers}
      noun={{ one: 'gatekeeper', many: 'gatekeepers' }}
      template={{ fileName: 'gatekeepers-template.csv', rows: [columns, columns.map(c => exampleRow[c])] }}
      checkHeader={header => gatekeeperCsvHeaderError(header, uploader)}
      onClose={onClose}
      options={
        <label className="flex items-center gap-2 rounded-xl bg-white p-4 text-[13px] text-[#0F172A]">
          <input type="checkbox" name="send_welcome_email" defaultChecked className="h-4 w-4 rounded border-[#D4D7E3]" />
          Send welcome email now (applies to every row) — uncheck to share each temp password manually instead
        </label>
      }
      formatHelp={scope.mode === 'select' ? (
        <>
          <p className="text-[12px] leading-[18px] text-[#475569]">
            Header row required, exactly: <code className={code}>{columns.join(',')}</code>
            <br />
            <code className={code}>club_id</code> must be a real club&apos;s internal ID. <code className={code}>certification_date</code> as YYYY-MM-DD, not in the future, or left blank for members who aren&apos;t certified yet. Every row needs its own <code className={code}>phone</code> number.
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
          Header row required, exactly: <code className={code}>{columns.join(',')}</code>
          <br />
          All rows are added to <strong>{scope.clubName}</strong>. <code className={code}>certification_date</code> as YYYY-MM-DD, not in the future, or left blank for members who aren&apos;t certified yet. Every row needs its own <code className={code}>phone</code> number.
        </p>
      )}
    />
  )
}
