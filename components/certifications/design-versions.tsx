'use client'

// A type's design versions (Story 10.4): date saved, who saved it and how many
// certificates were issued with each, with View (a pop-up that can switch
// between versions, download and print) and Edit / Edit a copy.

import { useState } from 'react'
import Link from 'next/link'
import { ModalOverlay } from '@/components/modal-overlay'
import { CertificatePreview } from '@/components/certifications/certificate-preview'
import { downloadBlob, fetchPdf, printBlob } from '@/components/certifications/pdf-actions'
import { Badge, FormCard, INPUT, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import { designLabel, type Design, type PlaceholderValues } from '@/lib/certificate-design'
import { formatCertDate } from '@/lib/certification-types'
import { isoToOrgDateTime } from '@/lib/org-date'

export type VersionRow = { version: number; design: Design; created_at: string; created_by_name: string | null; issued: number }

const SMALL_BTN = 'rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60'

export function DesignVersions({ typeId, versions, assets, sample, placeholders, canEdit, editingFrom, title = 'Versions' }: {
  typeId: string
  versions: VersionRow[]          // newest first
  assets: Record<string, string>
  sample: PlaceholderValues
  placeholders: PlaceholderValues
  canEdit: boolean
  editingFrom?: number | null
  title?: string
}) {
  const [viewing, setViewing] = useState<number | null>(null)
  const current = versions[0]?.version
  return (
    <section className="rounded-2xl bg-white p-6">
      <h2 className="text-[16px] font-bold text-[#0F172A]">{title}</h2>
      <p className="mt-0.5 text-xs text-[#64748B]">Saving never overwrites an earlier version. Each issued certificate stays linked to the version it was made with, so reprints look the same.</p>
      {versions.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748B]">No versions yet. Save to create version 1.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="py-2 pr-4">Version</th><th className="py-2 pr-4">Saved</th><th className="py-2 pr-4">Certificates issued</th><th className="py-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.version} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>v{v.version}</b>
                      {v.version === current && <Badge tone="ok">Current</Badge>}
                      {editingFrom === v.version && v.version !== current && <Badge tone="info">Editing a copy</Badge>}
                    </div>
                    <div className="text-xs text-[#64748B]">{designLabel(v.design)}</div>
                  </td>
                  <td className="py-3 pr-4">{formatCertDate(isoToOrgDateTime(v.created_at).date)}<div className="text-xs text-[#64748B]">{v.created_by_name ?? '—'}</div></td>
                  <td className="py-3 pr-4 tabular-nums">{v.issued}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className={SMALL_BTN} onClick={() => setViewing(v.version)}>View</button>
                      {canEdit && (
                        <Link href={v.version === current ? `/super-admin/certifications/${typeId}/design` : `/super-admin/certifications/${typeId}/design?from=${v.version}`} className={SMALL_BTN}>
                          {v.version === current ? 'Edit' : 'Edit a copy'}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing !== null && (
        <ModalOverlay onClose={() => setViewing(null)} maxWidth={860}>
          <VersionViewer typeId={typeId} versions={versions} start={viewing} assets={assets} sample={sample} placeholders={placeholders}
            canEdit={canEdit} onClose={() => setViewing(null)} />
        </ModalOverlay>
      )}
    </section>
  )
}

function VersionViewer({ typeId, versions, start, assets, sample, placeholders, canEdit, onClose }: {
  typeId: string; versions: VersionRow[]; start: number; assets: Record<string, string>
  sample: PlaceholderValues; placeholders: PlaceholderValues; canEdit: boolean; onClose: () => void
}) {
  const [version, setVersion] = useState(start)
  const [asPlaceholders, setAsPlaceholders] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const v = versions.find(x => x.version === version) ?? versions[0]
  const current = versions[0]?.version
  const pdf = async (mode: 'download' | 'print') => {
    setBusy(true); setError(null)
    try {
      const blob = await fetchPdf(`/super-admin/certifications/${typeId}/design/pdf?version=${v.version}${asPlaceholders ? '&placeholders=1' : ''}`)
      if (mode === 'download') downloadBlob(blob, `certificate-design-v${v.version}.pdf`)
      else printBlob(blob)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="[&>div]:max-w-none">
      <FormCard title={`Version ${v.version}`} subtitle={`${designLabel(v.design)} · saved ${formatCertDate(isoToOrgDateTime(v.created_at).date)}${v.created_by_name ? ` by ${v.created_by_name}` : ''} · ${v.issued} certificate${v.issued === 1 ? '' : 's'} issued with it`} onClose={onClose}>
        <div className="flex flex-col gap-3 overflow-y-auto px-6 pb-6">
          {error && <div role="alert" className="rounded-lg bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-medium text-[#DC2626]">{error}</div>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="ver-switch" className="text-[13px] font-medium text-[#0F172A]">Version</label>
              <select id="ver-switch" value={v.version} onChange={e => setVersion(Number(e.target.value))} className={`${INPUT} h-9 w-auto`}>
                {versions.map(x => <option key={x.version} value={x.version}>v{x.version}{x.version === current ? ' (current)' : ''}</option>)}
              </select>
              <label className="ml-2 flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={asPlaceholders} onChange={e => setAsPlaceholders(e.target.checked)} className="accent-[#022C51]" /> Show placeholders</label>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className={SMALL_BTN} disabled={busy} onClick={() => pdf('download')}>Download PDF</button>
              <button type="button" className={SMALL_BTN} disabled={busy} onClick={() => pdf('print')}>Print</button>
              {canEdit && (
                <Link href={v.version === current ? `/super-admin/certifications/${typeId}/design` : `/super-admin/certifications/${typeId}/design?from=${v.version}`} className={PRIMARY_BTN}>
                  {v.version === current ? 'Edit' : 'Edit a copy'}
                </Link>
              )}
            </div>
          </div>
          <div className="grid place-items-center rounded-2xl bg-[#E2E8F0]/60 p-4">
            <CertificatePreview design={v.design} values={asPlaceholders ? placeholders : sample} assets={assets} maxWidth={720} />
          </div>
        </div>
      </FormCard>
    </div>
  )
}
