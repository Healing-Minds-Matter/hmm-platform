'use client'

// Self-reported certifications on a profile (Stories 10.9, 10.10): the holder
// can add, change and withdraw theirs while waiting for review; reviewers in
// scope can verify or remove. Also used on the review queue.

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { ModalOverlay } from '@/components/modal-overlay'
import { Badge, FormCard, CANCEL_BTN, DANGER_BTN, HINT, INPUT, LABEL, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import { formatCertDate } from '@/lib/certification-types'
import { isoToOrgDateTime } from '@/lib/org-date'
import { ATTACHMENT_ACCEPT } from '@/lib/certificates'
import { SELF_REMOVE_REASONS, SELF_STATE_BADGE, selfExpiryLabel, type SelfReportedRow } from '@/lib/self-reported'
import { attachmentLinkAction, type CertActionState } from '@/actions/certificates'
import {
  addSelfReportedAction, editSelfReportedAction, removeSelfReportedAction, verifySelfReportedAction, withdrawSelfReportedAction,
} from '@/actions/self-reported'

type Popup =
  | { kind: 'add' }
  | { kind: 'edit' | 'withdraw' | 'verify' | 'remove'; row: SelfReportedRow }

export type SelfPerms = { self: boolean; verify: boolean; reviewRemove: boolean }

export function SelfReportedList({ rows, perms, names, today, holderName, holders, onNotice, emptyText }: {
  rows: SelfReportedRow[]
  perms: SelfPerms
  names: Record<string, string>
  today: string
  holderName?: string
  // The review queue shows whose each one is: holder id → label and profile link.
  holders?: Record<string, { name: string; label: string; href: string | null }>
  onNotice?: (message: string) => void
  emptyText: string
}) {
  const [popup, setPopup] = useState<Popup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canAdd = perms.self
  const close = () => setPopup(null)
  const done = (message?: string) => {
    setPopup(null)
    if (message) { if (onNotice) onNotice(message); else setNotice(message) }
  }
  // Removed and withdrawn ones go last, greyed.
  const order = (r: SelfReportedRow) => (r.state === 'removed' || r.state === 'withdrawn' ? 1 : 0)
  const sorted = [...rows].sort((a, b) => order(a) - order(b) || b.achieved_on.localeCompare(a.achieved_on))

  return (
    <div className="flex flex-col gap-3">
      {canAdd && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setPopup({ kind: 'add' })} className={PRIMARY_BTN}>+ Add a certification I hold</button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-lg bg-[#E6FFE7] px-4 py-2.5 text-[13px] font-medium text-[#0D8275]">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] px-4 py-6 text-center text-sm text-[#64748B]">{emptyText}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
          {sorted.map(r => {
            const p = perms
            const holder = holders?.[r.holder_id]
            const b = SELF_STATE_BADGE[r.state]
            const faded = r.state === 'removed' || r.state === 'withdrawn'
            return (
              <li key={r.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${faded ? 'opacity-70' : ''}`}>
                <div className="min-w-0">
                  {holder && (
                    <div className="mb-1 text-xs font-semibold text-[#022C51]">
                      {holder.href ? <Link href={holder.href} className="hover:underline">{holder.label}</Link> : holder.label}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0F172A]">{r.name}</span>
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[#475569]">
                    {r.organisation} · Achieved {formatCertDate(r.achieved_on)} · {selfExpiryLabel(r.expires_on, today)}
                  </p>
                  {r.state === 'verified' && r.reviewed_at && (
                    <p className="mt-0.5 text-xs text-[#0D8275]">Verified by {r.reviewed_by ? names[r.reviewed_by] ?? 'a reviewer' : 'a reviewer'} on {formatCertDate(orgDay(r.reviewed_at))}</p>
                  )}
                  {r.state === 'removed' && (
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      Removed by {r.reviewed_by ? names[r.reviewed_by] ?? 'a reviewer' : 'a reviewer'}{r.reviewed_at ? ` on ${formatCertDate(orgDay(r.reviewed_at))}` : ''}: {r.removed_reason_category}: {r.removed_reason}
                    </p>
                  )}
                  {r.state === 'withdrawn' && r.withdrawn_at && <p className="mt-0.5 text-xs text-[#64748B]">Withdrawn on {formatCertDate(orgDay(r.withdrawn_at))}. Only you can see this.</p>}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {r.attachment_path && <AttachmentButton path={r.attachment_path} />}
                  {p.self && r.state === 'unverified' && <>
                    <Small onClick={() => setPopup({ kind: 'edit', row: r })}>Edit</Small>
                    <Small onClick={() => setPopup({ kind: 'withdraw', row: r })}>Withdraw</Small>
                  </>}
                  {p.verify && r.state === 'unverified' && <Small tone="primary" onClick={() => setPopup({ kind: 'verify', row: r })}>Verify</Small>}
                  {p.reviewRemove && (r.state === 'unverified' || r.state === 'verified') && <Small tone="danger" onClick={() => setPopup({ kind: 'remove', row: r })}>Remove</Small>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {popup && (
        <ModalOverlay onClose={close}>
          {popup.kind === 'add' && <SelfForm today={today} onClose={close} onDone={done} />}
          {popup.kind === 'edit' && <SelfForm row={popup.row} today={today} onClose={close} onDone={done} />}
          {popup.kind === 'withdraw' && <ConfirmForm row={popup.row} action={withdrawSelfReportedAction} title={`Withdraw ${popup.row.name}`}
            text="It will no longer show to reviewers or anyone else. You’ll still see it in your own history." label="Withdraw" onClose={close} onDone={done} />}
          {popup.kind === 'verify' && <ConfirmForm row={popup.row} action={verifySelfReportedAction} title={`Verify ${popup.row.name}`}
            text={`Confirm you’ve checked the details${popup.row.attachment_path ? ' and the attachment' : ''}. ${holderName ?? holders?.[popup.row.holder_id]?.name ?? 'The holder'} will be told. A verified self-reported certification still doesn’t count as an official certificate.`}
            label="Verify" onClose={close} onDone={done} />}
          {popup.kind === 'remove' && <RemoveForm row={popup.row} holderName={holderName ?? holders?.[popup.row.holder_id]?.name} onClose={close} onDone={done} />}
        </ModalOverlay>
      )}
    </div>
  )
}

// A stored moment as its Sri Lanka calendar date.
const orgDay = (iso: string) => isoToOrgDateTime(iso).date

function Small({ children, onClick, tone = 'plain' }: { children: React.ReactNode; onClick: () => void; tone?: 'plain' | 'primary' | 'danger' }) {
  const cls = {
    plain: 'border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]',
    primary: 'border-[#F4AC1E] bg-[#F4AC1E] text-white hover:bg-[#E09B0F]',
    danger: 'border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2]',
  }[tone]
  return <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${cls}`}>{children}</button>
}

function AttachmentButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  return (
    <Small onClick={async () => {
      if (state === 'busy') return
      setState('busy')
      const url = await attachmentLinkAction(path)
      setState(url ? 'idle' : 'failed')
      if (url) window.open(url, '_blank', 'noopener')
    }}>
      {{ idle: 'Attachment', busy: 'Opening…', failed: 'Couldn’t open, retry' }[state]}
    </Small>
  )
}

function useClosing(action: (s: CertActionState, f: FormData) => Promise<CertActionState>, onDone: (m?: string) => void) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(action, null)
  useEffect(() => {
    if (state?.success) { onDone(state.message); router.refresh() }
  }, [state, onDone, router])
  // Submitted without React's automatic reset, so a refused save keeps what was chosen (radios, ticks, files).
  const onSubmit = useSubmitWithoutReset(formAction)
  return { state, onSubmit, pending }
}

function ErrorBanner({ error }: { error?: string }) {
  return error ? <div role="alert" className="rounded-lg bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-medium text-[#DC2626]">{error}</div> : null
}

function Footer({ onClose, pending, label, danger = false }: { onClose: () => void; pending: boolean; label: string; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-3 border-t border-[#E2E8F0] px-6 py-4">
      <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
      <button type="submit" disabled={pending} className={danger ? DANGER_BTN : PRIMARY_BTN}>{pending ? 'Saving…' : label}</button>
    </div>
  )
}

// Add or change a certification I hold. Controlled fields, so a refused save keeps what was typed.
function SelfForm({ row, today, onClose, onDone }: { row?: SelfReportedRow; today: string; onClose: () => void; onDone: (m?: string) => void }) {
  const { state, onSubmit, pending } = useClosing(row ? editSelfReportedAction : addSelfReportedAction, onDone)
  const [name, setName] = useState(row?.name ?? '')
  const [org, setOrg] = useState(row?.organisation ?? '')
  const [achieved, setAchieved] = useState(row?.achieved_on ?? '')
  const [noExpiry, setNoExpiry] = useState(row ? row.expires_on == null : false)
  const [expires, setExpires] = useState(row?.expires_on ?? '')
  return (
    <FormCard
      title={row ? `Change ${row.name}` : 'Add a certification I hold'}
      subtitle="From another organisation. It shows as self-reported until a reviewer checks it, and never counts as an official certificate."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <ErrorBanner error={state?.error} />
          {row && <input type="hidden" name="self_id" value={row.id} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="sr-name">Certification name</label>
              <input id="sr-name" name="name" value={name} onChange={e => setName(e.target.value)} maxLength={160} className={INPUT} placeholder="For example: Mental Health First Aid" required />
            </div>
            <div>
              <label className={LABEL} htmlFor="sr-org">Issuing organisation</label>
              <input id="sr-org" name="organisation" value={org} onChange={e => setOrg(e.target.value)} maxLength={160} className={INPUT} required />
            </div>
            <div>
              <label className={LABEL} htmlFor="sr-achieved">Date achieved</label>
              <input id="sr-achieved" type="date" name="achieved_on" value={achieved} max={today} onChange={e => setAchieved(e.target.value)} className={INPUT} required />
            </div>
            <div>
              <label className={LABEL} htmlFor="sr-expires">Expiry date</label>
              <input id="sr-expires" type="date" name="expires_on" value={noExpiry ? '' : expires} min={achieved || undefined} disabled={noExpiry}
                onChange={e => setExpires(e.target.value)} className={`${INPUT} disabled:bg-[#F1F5F9] disabled:text-[#94A3B8]`} required={!noExpiry} />
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[#0F172A]">
                <input type="checkbox" name="no_expiry" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} className="h-4 w-4 accent-[#022C51]" />
                No expiry
              </label>
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="sr-attachment">{row?.attachment_path ? 'Replace attachment (optional)' : 'Attachment (optional)'}</label>
            <input id="sr-attachment" type="file" name="attachment" accept={ATTACHMENT_ACCEPT} className="block w-full text-[13px] text-[#475569] file:mr-3 file:rounded-md file:border-0 file:bg-[#F1F5F9] file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-[#0F172A]" />
            <p className={HINT}>PDF, JPG or PNG, up to 10 MB. A clear copy helps the reviewer verify it.</p>
          </div>
        </div>
        <Footer onClose={onClose} pending={pending} label={row ? 'Save changes' : 'Add certification'} />
      </form>
    </FormCard>
  )
}

function ConfirmForm({ row, action, title, text, label, onClose, onDone }: {
  row: SelfReportedRow
  action: (s: CertActionState, f: FormData) => Promise<CertActionState>
  title: string; text: string; label: string
  onClose: () => void; onDone: (m?: string) => void
}) {
  const { state, onSubmit, pending } = useClosing(action, onDone)
  return (
    <FormCard title={title} subtitle={`${row.organisation} · achieved ${formatCertDate(row.achieved_on)}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="self_id" value={row.id} />
          <p className="text-[13px] text-[#475569]">{text}</p>
        </div>
        <Footer onClose={onClose} pending={pending} label={label} />
      </form>
    </FormCard>
  )
}

function RemoveForm({ row, holderName, onClose, onDone }: { row: SelfReportedRow; holderName?: string; onClose: () => void; onDone: (m?: string) => void }) {
  const { state, onSubmit, pending } = useClosing(removeSelfReportedAction, onDone)
  const [category, setCategory] = useState('')
  const [reason, setReason] = useState('')
  return (
    <FormCard title={`Remove ${row.name}`} subtitle={`${row.organisation} · achieved ${formatCertDate(row.achieved_on)}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          <ErrorBanner error={state?.error} />
          <input type="hidden" name="self_id" value={row.id} />
          <div className="rounded-lg bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
            {holderName ?? 'The holder'} will be told, with your reason, and that they can add it again (for example with a clearer attachment).
          </div>
          <div>
            <label className={LABEL} htmlFor="sr-remove-category">Reason</label>
            <select id="sr-remove-category" name="category" value={category} onChange={e => setCategory(e.target.value)} className={INPUT} required>
              <option value="" disabled>Choose a reason…</option>
              {SELF_REMOVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="sr-remove-reason">Explanation</label>
            <textarea id="sr-remove-reason" name="reason" rows={3} minLength={10} value={reason} onChange={e => setReason(e.target.value)} className={INPUT} placeholder="At least 10 characters. The person will see this." required />
          </div>
        </div>
        <Footer onClose={onClose} pending={pending} label="Remove" danger />
      </form>
    </FormCard>
  )
}
