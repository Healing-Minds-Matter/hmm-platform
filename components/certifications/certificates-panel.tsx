'use client'

// A person's Certifications section on their portal profile (Story 10.12 Sc02):
// current certificates with their actions, followed by the certification
// journey (Story 10.11). Pop-ups open in place, like DeactivationControls.

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { downloadBlob, fetchPdf, printBlob } from '@/components/certifications/pdf-actions'
import { Badge, Code, FormCard, CANCEL_BTN, DANGER_BTN, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import { formatCertDate, validityLabel, type CertificationTypeRow } from '@/lib/certification-types'
import {
  ATTACHMENT_ACCEPT, FORMAT_LABEL, REMOVE_REASONS, STATUS_BADGE, canRenew, describeChanges, expiryFor,
  type CertificateFormat, type CertificateRow, type JourneyEntry,
} from '@/lib/certificates'
import {
  addCertificateAction, attachmentLinkAction, certificatePdfLinkAction, editCertificateAction, removeCertificateAction, restoreCertificateAction,
  type CertActionState,
} from '@/actions/certificates'
import type { CertPermissions } from '@/lib/certificates.server'
import { SELF_STATE_BADGE, selfExpiryLabel, type SelfReportedRow } from '@/lib/self-reported'
import { SelfReportedList } from '@/components/certifications/self-reported-list'

type Popup =
  | { kind: 'add' }
  | { kind: 'renew'; cert: CertificateRow }
  | { kind: 'edit'; cert: CertificateRow }
  | { kind: 'remove'; cert: CertificateRow }
  | { kind: 'restore'; cert: CertificateRow }

type Props = {
  holderId: string
  holderName: string
  certs: CertificateRow[]
  selfReported: SelfReportedRow[]
  types: CertificationTypeRow[]
  journey: JourneyEntry[]
  names: Record<string, string>
  perms: CertPermissions
  designVersions: Record<string, number>   // current design version per type
  today: string
}

export function CertificatesPanel(props: Props) {
  const { certs, selfReported, types, journey, names, perms } = props
  const [popup, setPopup] = useState<Popup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const typeById = new Map(types.map(t => [t.id, t]))
  const current = certs.filter(c => c.is_current && !c.removed_at)
  const close = () => setPopup(null)
  const done = (message?: string) => { setPopup(null); if (message) setNotice(message) }

  const actionsFor = (c: CertificateRow) => (
    <div className="flex flex-wrap justify-end gap-1.5">
      {c.pdf_path && <CertificateButton certId={c.id} />}
      {c.attachment_path && <AttachmentButton path={c.attachment_path} />}
      {perms.award && canRenew(c, typeById.get(c.type_id)?.status) && (
        <SmallButton tone="primary" onClick={() => setPopup({ kind: 'renew', cert: c })}>Renew</SmallButton>
      )}
      {perms.edit && !c.removed_at && <SmallButton onClick={() => setPopup({ kind: 'edit', cert: c })}>Edit</SmallButton>}
      {perms.remove && !c.removed_at && <SmallButton tone="danger" onClick={() => setPopup({ kind: 'remove', cert: c })}>Remove</SmallButton>}
      {perms.restore && c.removed_at && <SmallButton onClick={() => setPopup({ kind: 'restore', cert: c })}>Undo removal</SmallButton>}
    </div>
  )

  return (
    <section className="flex flex-col gap-6 rounded-2xl bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[#0F172A]">Certifications</h2>
          <p className="mt-0.5 text-xs text-[#64748B]">
            Current official certificates{perms.self ? ', added by a Super Admin' : ''}. Older and removed ones are in the journey below.
          </p>
        </div>
        {perms.award && (
          <button type="button" onClick={() => setPopup({ kind: 'add' })} className={PRIMARY_BTN}>+ Add certification</button>
        )}
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between rounded-lg bg-[#E6FFE7] px-4 py-2.5 text-[13px] font-medium text-[#0D8275]">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}

      {current.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] px-4 py-6 text-center text-sm text-[#64748B]">No certifications</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="py-2 pr-4">Certification</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Achieved</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Format</th>
                <th className="py-2 pr-4">Certificate no.</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {current.map(c => {
                const t = typeById.get(c.type_id)
                const s = STATUS_BADGE[c.status]
                return (
                  <tr key={c.id} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-[#0F172A]">{t?.name ?? 'Unknown type'}</div>
                      {t && <Code>{t.code}</Code>}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={s.tone}>{c.status === 'stopped' && c.stopped_on ? `Stopped ${formatCertDate(c.stopped_on)}` : s.label}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-[#0F172A]">{formatCertDate(c.achieved_on)}</td>
                    <td className="py-3 pr-4 text-[#0F172A]">{c.expires_on ? formatCertDate(c.expires_on) : 'Lifetime'}</td>
                    <td className="py-3 pr-4 text-[#475569]">{FORMAT_LABEL[c.format]}</td>
                    <td className="py-3 pr-4">{c.certificate_number ? <Code>{c.certificate_number}</Code> : <span className="text-[#94A3B8]">—</span>}</td>
                    <td className="py-3">{actionsFor(c)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="border-b border-[#E2E8F0] pb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B]">{perms.self ? 'Added by you' : `Added by ${props.holderName}`}</h3>
          <p className="mt-0.5 text-xs text-[#64748B]">Certifications from other organisations. These never count as official certificates, even when verified.</p>
        </div>
        <SelfReportedList
          rows={selfReported}
          perms={{ self: perms.self, verify: perms.verify, reviewRemove: perms.reviewRemove }}
          names={names}
          today={props.today}
          holderName={props.holderName}
          onNotice={setNotice}
          emptyText={perms.self ? 'You haven’t added any certifications from other organisations.' : 'None added.'}
        />
      </div>

      <div>
        <h3 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B]">Certification journey</h3>
        {journey.length === 0 ? (
          <p className="mt-3 text-sm text-[#64748B]">Nothing yet.</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {journey.map(e => (
              <JourneyItem key={e.key} entry={e} typeById={typeById} names={names} today={props.today} actions={e.kind === 'certificate' ? actionsFor(e.cert) : null} />
            ))}
          </ol>
        )}
      </div>

      {popup && (
        <ModalOverlay onClose={close}>
          {popup.kind === 'add' && <AwardForm {...props} onClose={close} onDone={done} />}
          {popup.kind === 'renew' && <AwardForm {...props} renew={popup.cert} onClose={close} onDone={done} />}
          {popup.kind === 'edit' && <EditForm cert={popup.cert} type={typeById.get(popup.cert.type_id)} designVersion={props.designVersions[popup.cert.type_id] ?? null} today={props.today} onClose={close} onDone={done} />}
          {popup.kind === 'remove' && <RemoveForm cert={popup.cert} certs={certs} type={typeById.get(popup.cert.type_id)} holderName={props.holderName} onClose={close} onDone={done} />}
          {popup.kind === 'restore' && <RestoreForm cert={popup.cert} type={typeById.get(popup.cert.type_id)} onClose={close} onDone={done} />}
        </ModalOverlay>
      )}
    </section>
  )
}

// ── Journey ──────────────────────────────────────────────────────────────────
function JourneyItem({ entry, typeById, names, today, actions }: {
  entry: JourneyEntry
  typeById: Map<string, CertificationTypeRow>
  names: Record<string, string>
  today: string
  actions: React.ReactNode
}) {
  const typeName = (id: string) => typeById.get(id)?.name ?? 'Unknown type'
  let title: React.ReactNode
  let detail: React.ReactNode = null
  let tone: 'ok' | 'warn' | 'bad' | 'info' | 'grey' = 'info'

  switch (entry.kind) {
    case 'certificate': {
      const c = entry.cert
      const s = STATUS_BADGE[c.status]
      tone = s.tone
      title = <>{typeName(c.type_id)} achieved <Badge tone={s.tone}>{s.label}</Badge>{c.migrated && <Badge tone="grey">Migrated</Badge>}</>
      detail = [
        c.expires_on ? `Expires ${formatCertDate(c.expires_on)}` : 'Lifetime',
        FORMAT_LABEL[c.format],
        c.certificate_number ? `Certificate ${c.certificate_number}${c.design_version ? ` (design v${c.design_version})` : ''}` : null,
        c.migrated ? 'Created from the old QPR certification date' : c.added_by ? `Added by ${names[c.added_by] ?? 'someone no longer in the system'}` : null,
        c.removed_at ? `Removed${c.removed_by ? ` by ${names[c.removed_by] ?? 'someone'}` : ''}: ${c.removed_reason_category}: ${c.removed_reason}` : null,
      ].filter(Boolean).join(' · ')
      break
    }
    case 'expired':
      tone = 'bad'
      title = `${typeName(entry.cert.type_id)} expired`
      break
    case 'event': {
      const ev = entry.event
      const t = typeName(entry.cert.type_id)
      if (ev.kind === 'edited') {
        tone = 'warn'
        title = `${t} edited by ${ev.actor_label}`
        detail = [describeChanges(ev.changes), ev.reason ? `Reason: ${ev.reason}` : null].filter(Boolean).join(' · ')
      } else if (ev.kind === 'removed') {
        tone = 'bad'
        title = `${t} removed by ${ev.actor_label}`
        detail = ev.reason ? `Reason: ${ev.reason}` : null
      } else {
        tone = 'ok'
        title = `${t} removal undone by ${ev.actor_label}`
        detail = ev.reason
      }
      break
    }
    case 'retired':
      tone = 'grey'
      title = `${typeName(entry.typeId)} programme retired`
      detail = entry.option === 'stop' ? 'Existing certificates stopped being valid.' : 'Existing certificates stayed valid until their own expiry.'
      break
    case 'self': {
      const sr = entry.self
      const b = SELF_STATE_BADGE[sr.state]
      tone = b.tone
      title = <>{sr.name} achieved (self-reported) <Badge tone={b.tone}>{b.label}</Badge></>
      detail = `${sr.organisation} · ${selfExpiryLabel(sr.expires_on, today)}`
      break
    }
    case 'self_outcome': {
      const sr = entry.self
      const by = sr.reviewed_by ? names[sr.reviewed_by] ?? 'a reviewer' : 'a reviewer'
      if (sr.state === 'verified') { tone = 'ok'; title = `${sr.name} verified by ${by}` }
      else if (sr.state === 'removed') { tone = 'bad'; title = `${sr.name} removed by ${by}`; detail = `Reason: ${sr.removed_reason_category}: ${sr.removed_reason}` }
      else { tone = 'grey'; title = `${sr.name} withdrawn by holder` }
      break
    }
    case 'reactivated':
      tone = 'ok'
      title = `${typeName(entry.typeId)} programme reactivated`
      detail = entry.stoppedCerts ? 'Certificates stopped at retirement stay stopped and can be renewed.' : null
      break
  }
  const dot = { ok: 'bg-[#10B981]', warn: 'bg-[#D97706]', bad: 'bg-[#DC2626]', info: 'bg-[#265BA2]', grey: 'bg-[#94A3B8]' }[tone]

  return (
    <li className="relative flex gap-4 border-l border-[#E2E8F0] pb-5 pl-5 last:pb-0">
      <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${dot}`} />
      <div className="w-24 flex-shrink-0 pt-0.5 text-xs font-medium text-[#64748B]">{formatCertDate(entry.date)}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#0F172A]">{title}</div>
          {detail && <p className="mt-0.5 text-xs text-[#475569]">{detail}</p>}
        </div>
        {actions}
      </div>
    </li>
  )
}

// ── Small pieces ─────────────────────────────────────────────────────────────
function SmallButton({ children, onClick, tone = 'plain' }: { children: React.ReactNode; onClick: () => void; tone?: 'plain' | 'primary' | 'danger' }) {
  const cls = {
    plain: 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]',
    primary: 'border-[#F4AC1E] bg-[#F4AC1E] text-white hover:bg-[#E09B0F]',
    danger: 'border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]',
  }[tone]
  return (
    <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${cls}`}>
      {children}
    </button>
  )
}

function AttachmentButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  return (
    <SmallButton
      onClick={async () => {
        if (state === 'busy') return
        setState('busy')
        const url = await attachmentLinkAction(path)
        setState(url ? 'idle' : 'failed')
        if (url) window.open(url, '_blank', 'noopener')
      }}
    >
      {{ idle: 'Attachment', busy: 'Opening…', failed: 'Couldn’t open, retry' }[state]}
    </SmallButton>
  )
}

function useClosingAction(action: (s: CertActionState, f: FormData) => Promise<CertActionState>, onDone: (m?: string) => void) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(action, null)
  useEffect(() => {
    if (state?.success) { onDone(state.message); router.refresh() }
  }, [state, onDone, router])
  return { state, formAction, pending }
}

function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null
  return <div role="alert" className="rounded-lg bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-medium text-[#DC2626]">{error}</div>
}

function Footer({ onClose, pending, label, danger = false }: { onClose: () => void; pending: boolean; label: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-3 border-t border-[#E2E8F0] px-6 py-4">
      <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
      <button type="submit" disabled={pending} className={danger ? DANGER_BTN : PRIMARY_BTN}>{pending ? 'Saving…' : label}</button>
    </div>
  )
}

// Digital and Both make a PDF from the type's design, so they need one (Story 10.4 Sc02).
function FormatChoice({ value, onChange, designVersion, typeChosen = true }: {
  value: CertificateFormat; onChange: (v: CertificateFormat) => void; designVersion: number | null; typeChosen?: boolean
}) {
  return (
    <fieldset>
      <legend className={LABEL}>Format</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(FORMAT_LABEL) as CertificateFormat[]).map(f => (
          <label key={f} className={OPTION}>
            <input type="radio" name="format" value={f} checked={value === f} onChange={() => onChange(f)} disabled={f !== 'physical' && !designVersion}
              className="mt-0.5 accent-[#022C51]" />
            {FORMAT_LABEL[f]}
          </label>
        ))}
      </div>
      {typeChosen && (
        <p className={HINT}>
          {designVersion
            ? `Digital and Both create the certificate PDF from design version ${designVersion}, with a certificate number.`
            : 'This type has no digital certificate design yet, so it can only be recorded as physical.'}
        </p>
      )}
    </fieldset>
  )
}

function CertificateButton({ certId }: { certId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  return (
    <>
      <SmallButton onClick={async () => {
        if (state === 'busy') return
        setState('busy')
        const link = await certificatePdfLinkAction(certId)
        setState(link ? 'idle' : 'failed')
        setUrl(link)
      }}>
        {{ idle: 'Certificate', busy: 'Opening…', failed: 'Couldn’t open, retry' }[state]}
      </SmallButton>
      {url && <CertificateViewer url={url} onClose={() => setUrl(null)} />}
    </>
  )
}

// View a digital certificate (Story 10.6 Sc01), with Download PDF and Print.
function CertificateViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const act = async (mode: 'download' | 'print') => {
    setBusy(true)
    try {
      const blob = await fetchPdf(url)
      if (mode === 'download') downloadBlob(blob, 'certificate.pdf')
      else printBlob(blob)
    } catch { window.open(url, '_blank', 'noopener') } finally { setBusy(false) }
  }
  return (
    <ModalOverlay onClose={onClose} maxWidth={900}>
      <div className="[&>div]:max-w-none">
        <FormCard title="Digital certificate" subtitle="As issued, with the design version it was made with." onClose={onClose}>
          <div className="flex flex-col gap-3 px-6 pb-6">
            <div className="flex justify-end gap-2">
              <SmallButton onClick={() => { if (!busy) void act('download') }}>Download PDF</SmallButton>
              <SmallButton onClick={() => { if (!busy) void act('print') }}>Print</SmallButton>
            </div>
            <iframe src={url} title="Digital certificate" className="h-[65vh] w-full rounded-lg border border-[#E2E8F0]" />
          </div>
        </FormCard>
      </div>
    </ModalOverlay>
  )
}

function AttachmentInput({ replacing }: { replacing?: boolean }) {
  return (
    <div>
      <label className={LABEL} htmlFor="cert-attachment">{replacing ? 'Replace attachment (optional)' : 'Attachment (optional)'}</label>
      <input id="cert-attachment" type="file" name="attachment" accept={ATTACHMENT_ACCEPT} className="block w-full text-[13px] text-[#475569] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F5F9] file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-[#0F172A]" />
      <p className={HINT}>PDF, JPG or PNG, up to 10 MB.</p>
    </div>
  )
}

// ── Add / renew (Stories 10.5, 10.7) ─────────────────────────────────────────
function AwardForm({ holderId, holderName, certs, types, designVersions, today, renew, onClose, onDone }: Props & {
  renew?: CertificateRow
  onClose: () => void
  onDone: (m?: string) => void
}) {
  const { state, formAction, pending } = useClosingAction(addCertificateAction, onDone)
  const offered = types.filter(t => t.status !== 'retired')
  const [typeId, setTypeId] = useState(renew?.type_id ?? '')
  const [date, setDate] = useState('')
  const [chosenFormat, setFormat] = useState<CertificateFormat>(renew?.format ?? 'physical')
  // Switching to a type with no design falls back to Physical.
  const format: CertificateFormat = typeId && !designVersions[typeId] ? 'physical' : chosenFormat
  const type = types.find(t => t.id === typeId)
  const held = certs.find(c => c.type_id === typeId && c.is_current && !c.removed_at)
  const expiry = type && date ? expiryFor(date, type.validity_value, type.validity_unit) : null

  return (
    <FormCard
      title={renew ? `Renew ${type?.name ?? 'certificate'}` : 'Add certification'}
      subtitle={`For ${holderName}. The expiry is worked out from the type’s validity.`}
      onClose={onClose}
    >
      <form action={formAction} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="holder_id" value={holderId} />
          {renew && <input type="hidden" name="renews_id" value={renew.id} />}
          {renew ? (
            <input type="hidden" name="type_id" value={typeId} />
          ) : (
            <div>
              <label className={LABEL} htmlFor="cert-type">Certification type</label>
              <select id="cert-type" name="type_id" value={typeId} onChange={e => setTypeId(e.target.value)} className={INPUT} required>
                <option value="">Choose a type…</option>
                {offered.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
              {offered.length === 0 && <p className={HINT}>No active certification types. Add one under Certifications first.</p>}
            </div>
          )}
          {held && (
            <div className="rounded-lg bg-[#EFF6FF] px-4 py-3 text-[13px] text-[#265BA2]">
              This renews the existing {type?.name} certificate from {formatCertDate(held.achieved_on)}. The older one stays in the journey as Renewed.
              The new date must be after {formatCertDate(held.achieved_on)}.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="cert-date">Date achieved</label>
              <input id="cert-date" type="date" name="achieved_on" value={date} max={today} min={held ? undefined : type?.offered_from} onChange={e => setDate(e.target.value)} className={INPUT} required />
            </div>
            <div>
              <span className={LABEL}>Expires</span>
              <div className={`${INPUT} flex items-center bg-[#F8FAFC] text-[#475569]`}>
                {type ? (type.validity_value == null ? 'Lifetime (no expiry)' : expiry ? formatCertDate(expiry) : `${validityLabel(type)} after the date achieved`) : '—'}
              </div>
            </div>
          </div>
          <FormatChoice value={format} onChange={setFormat} designVersion={typeId ? designVersions[typeId] ?? null : null} typeChosen={!!typeId} />
          <AttachmentInput />
        </div>
        <Footer onClose={onClose} pending={pending} label={renew || held ? 'Renew certificate' : 'Add certificate'} />
      </form>
    </FormCard>
  )
}

// ── Edit (Story 10.6) ────────────────────────────────────────────────────────
function EditForm({ cert, type, designVersion, today, onClose, onDone }: {
  cert: CertificateRow
  type?: CertificationTypeRow
  designVersion: number | null      // the type's current design version
  today: string
  onClose: () => void
  onDone: (m?: string) => void
}) {
  const { state, formAction, pending } = useClosingAction(editCertificateAction, onDone)
  const [date, setDate] = useState(cert.achieved_on)
  const [format, setFormat] = useState<CertificateFormat>(cert.format)
  // Controlled, so a refused save doesn't clear what was typed.
  const [reason, setReason] = useState('')
  const [pdf, setPdf] = useState<'keep' | 'original' | 'current'>('keep')
  const expiry = expiryFor(date, cert.validity_value, cert.validity_unit)
  const numbered = !!cert.certificate_number
  const stale = numbered && pdf === 'keep' && date !== cert.achieved_on

  return (
    <FormCard title={`Edit ${type?.name ?? 'certificate'}`} subtitle="The type can’t be changed. The person will be told what changed and why." onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="certificate_id" value={cert.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="edit-date">Date achieved</label>
              <input id="edit-date" type="date" name="achieved_on" value={date} max={today} min={type?.offered_from} onChange={e => setDate(e.target.value)} className={INPUT} required />
            </div>
            <div>
              <span className={LABEL}>Expires</span>
              <div className={`${INPUT} flex items-center bg-[#F8FAFC] text-[#475569]`}>
                {cert.validity_value == null ? 'Lifetime (no expiry)' : expiry ? formatCertDate(expiry) : '—'}
              </div>
              <p className={HINT}>Uses the validity it was awarded with.</p>
            </div>
          </div>
          {/* A numbered certificate keeps its number and PDF even if it becomes Physical. */}
          <FormatChoice value={format} onChange={setFormat} designVersion={numbered ? cert.design_version ?? designVersion : designVersion} />
          {numbered && (
            <fieldset>
              <legend className={LABEL}>Certificate PDF ({cert.certificate_number})</legend>
              <div className="flex flex-col gap-2">
                <label className={OPTION}><input type="radio" name="pdf" value="keep" checked={pdf === 'keep'} onChange={() => setPdf('keep')} className="mt-0.5 accent-[#022C51]" /> Keep the current PDF</label>
                <label className={OPTION}><input type="radio" name="pdf" value="original" checked={pdf === 'original'} onChange={() => setPdf('original')} className="mt-0.5 accent-[#022C51]" /> Re-issue with the design it was made with (version {cert.design_version})</label>
                {designVersion && designVersion !== cert.design_version && (
                  <label className={OPTION}><input type="radio" name="pdf" value="current" checked={pdf === 'current'} onChange={() => setPdf('current')} className="mt-0.5 accent-[#022C51]" /> Re-issue with the current design (version {designVersion})</label>
                )}
              </div>
              <p className={HINT}>{stale ? 'The PDF still shows the old date unless you re-issue it.' : 'A re-issued PDF keeps the same certificate number.'}</p>
            </fieldset>
          )}
          <AttachmentInput replacing={!!cert.attachment_path} />
          <div>
            <label className={LABEL} htmlFor="edit-reason">Reason for the change</label>
            <textarea id="edit-reason" name="reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} className={INPUT} placeholder="For example: the date was entered wrongly" required />
          </div>
        </div>
        <Footer onClose={onClose} pending={pending} label="Save changes" />
      </form>
    </FormCard>
  )
}

// ── Remove (Story 10.8) ──────────────────────────────────────────────────────
function RemoveForm({ cert, certs, type, holderName, onClose, onDone }: {
  cert: CertificateRow
  certs: CertificateRow[]
  type?: CertificationTypeRow
  holderName: string
  onClose: () => void
  onDone: (m?: string) => void
}) {
  const { state, formAction, pending } = useClosingAction(removeCertificateAction, onDone)
  const [category, setCategory] = useState('')
  const [reason, setReason] = useState('')
  // The certificate that becomes current, if this one is the current one.
  const next = cert.is_current
    ? certs.filter(c => c.id !== cert.id && c.type_id === cert.type_id && !c.removed_at)
        .sort((a, b) => b.achieved_on.localeCompare(a.achieved_on) || b.created_at.localeCompare(a.created_at))[0]
    : undefined

  return (
    <FormCard title={`Remove ${type?.name ?? 'certificate'}`} subtitle={`From ${holderName}’s profile. It’s kept in the journey and audit history.`} onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="certificate_id" value={cert.id} />
          <div className="rounded-lg bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
            This certificate (achieved {formatCertDate(cert.achieved_on)}) stops counting straight away.{' '}
            {cert.is_current
              ? next
                ? `The previous ${type?.name} certificate from ${formatCertDate(next.achieved_on)} becomes the current one.`
                : `${holderName} will have no ${type?.name} certificate.`
              : 'It isn’t the current one, so the current certificate doesn’t change.'}
            {' '}{holderName} will be told, with your reason.
          </div>
          <div>
            <label className={LABEL} htmlFor="remove-category">Reason</label>
            <select id="remove-category" name="category" className={INPUT} required value={category} onChange={e => setCategory(e.target.value)}>
              <option value="" disabled>Choose a reason…</option>
              {REMOVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="remove-reason">Explanation</label>
            <textarea id="remove-reason" name="reason" rows={3} minLength={10} value={reason} onChange={e => setReason(e.target.value)} className={INPUT} placeholder="At least 10 characters. The person will see this." required />
          </div>
        </div>
        <Footer onClose={onClose} pending={pending} label="Remove certificate" danger />
      </form>
    </FormCard>
  )
}

// ── Undo removal (Story 10.8 Sc05) ───────────────────────────────────────────
function RestoreForm({ cert, type, onClose, onDone }: {
  cert: CertificateRow
  type?: CertificationTypeRow
  onClose: () => void
  onDone: (m?: string) => void
}) {
  const { state, formAction, pending } = useClosingAction(restoreCertificateAction, onDone)
  return (
    <FormCard title={`Undo removal of ${type?.name ?? 'certificate'}`} subtitle="The certificate counts again from now. The holder and their Champion are told." onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="certificate_id" value={cert.id} />
          <p className="text-[13px] text-[#475569]">
            Removed for: <span className="font-medium text-[#0F172A]">{cert.removed_reason_category}: {cert.removed_reason}</span>
          </p>
        </div>
        <Footer onClose={onClose} pending={pending} label="Undo removal" />
      </form>
    </FormCard>
  )
}
