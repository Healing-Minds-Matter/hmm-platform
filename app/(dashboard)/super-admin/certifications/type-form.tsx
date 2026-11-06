'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { createTypeAction, updateTypeAction } from '@/actions/certification-types'
import { TYPE_TEXT, formatCertDate, issuedBanner, type CertificationTypeRow, type IssuedFacts } from '@/lib/certification-types'
import { CANCEL_BTN, FormCard, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN, SECTION, SECTION_TITLE } from '@/components/certifications/cert-ui'

const LOCKED_INPUT = `${INPUT} cursor-not-allowed bg-[#F1F5F9] pr-9 text-[#475569]`

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

// New / Edit certification type (Story 10.1), as a pop-up or a full page.
// Retiring isn't part of this form: it has its own Retire type action on the type's page.
export function TypeForm({ type, issued, today, inModal = false }: {
  type?: CertificationTypeRow
  issued?: IssuedFacts
  today?: string               // default Offered from for a new type
  inModal?: boolean
}) {
  const router = useRouter()
  const editing = !!type
  const close = inModal ? () => router.back() : (() => router.push(editing ? `/super-admin/certifications/${type.id}` : '/super-admin/certifications'))
  const [state, formAction, isPending] = useActionState(editing ? updateTypeAction : createTypeAction, null)
  // Submitted without React's automatic reset, so a refused save keeps every choice (radios included).
  const onSubmit = useSubmitWithoutReset(formAction)
  const v = state?.values
  // Once any certificate of the type exists, its code and Offered from are fixed.
  const locked = editing && (issued?.certificates ?? 0) > 0
  const latest = locked ? issued?.latestAchievedOn ?? null : null

  const [kind, setKind] = useState<'lifetime' | 'fixed'>(
    (v?.validity_kind as 'lifetime' | 'fixed' | undefined) ?? (type ? (type.validity_value == null ? 'lifetime' : 'fixed') : 'fixed')
  )
  const [from, setFrom] = useState(v?.offered_from ?? type?.offered_from ?? today ?? '')

  useEffect(() => {
    if (!state?.success) return
    if (editing) close()
    else router.push(`/super-admin/certifications/${state.id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Offered until can't be before Offered from, or (once issued) before the latest date achieved.
  const untilMin = latest && latest > from ? latest : from

  return (
    <FormCard
      title={editing ? `Edit ${type.name}` : 'New certification type'}
      subtitle={editing ? 'Changes apply to certificates issued from now on.' : 'Define a certification HMM recognises. Its digital certificate design can be added afterwards.'}
      onClose={close}
    >
      <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
        {editing && <input type="hidden" name="id" value={type.id} />}
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {locked && (
            <div role="note" className="flex gap-2.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-[13px] text-[#1E3A8A]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-none" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z" clipRule="evenodd" /></svg>
              <p>{issuedBanner(issued?.people ?? 0)}</p>
            </div>
          )}
          {state?.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>}

          <div className={SECTION}>
            <h2 className={SECTION_TITLE}>Certification</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className={LABEL}>Name <span className="text-[#DC2626]">*</span></label>
                <input id="name" name="name" required maxLength={120} defaultValue={v?.name ?? type?.name} placeholder="e.g. Psychological First Aid" className={INPUT} autoFocus />
              </div>
              <div>
                <label htmlFor="code" className={LABEL}>Code <span className="text-[#DC2626]">*</span></label>
                <div className="relative">
                  <input id="code" name="code" required maxLength={12} defaultValue={locked ? type?.code : v?.code ?? type?.code} readOnly={locked} aria-readonly={locked || undefined}
                    placeholder="e.g. PFA" aria-describedby="code-hint" className={`${locked ? LOCKED_INPUT : INPUT} font-mono uppercase`} />
                  {locked && <LockIcon />}
                </div>
                <p id="code-hint" className={HINT}>{locked ? `${TYPE_TEXT.lockedHint} The code is part of every certificate number.` : 'Letters, numbers and hyphens. Used in certificate numbers (HMM-CODE-YEAR-number). Fixed once certificates are issued.'}</p>
              </div>
            </div>
            <div>
              <label htmlFor="issuing_body" className={LABEL}>Issuing body</label>
              <input id="issuing_body" name="issuing_body" defaultValue={v?.issuing_body ?? type?.issuing_body ?? ''} placeholder="e.g. QPR Institute" className={INPUT} />
            </div>
            <div>
              <label htmlFor="description" className={LABEL}>Description</label>
              <textarea id="description" name="description" rows={2} defaultValue={v?.description ?? type?.description ?? ''} className={`${INPUT} h-auto py-2.5`} />
            </div>
          </div>

          <fieldset className={SECTION} aria-describedby="validity-hint">
            <legend className="sr-only">{TYPE_TEXT.validityLabel}</legend>
            <h2 className={SECTION_TITLE} aria-hidden="true">{TYPE_TEXT.validityLabel} <span className="text-[#DC2626]">*</span></h2>
            <p id="validity-hint" className={`${HINT} -mt-1`}>{TYPE_TEXT.validityHint}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={OPTION}>
                <input type="radio" name="validity_kind" value="lifetime" checked={kind === 'lifetime'} onChange={() => setKind('lifetime')} className="mt-0.5 accent-[#022C51]" />
                <span>Lifetime<span className="block text-[12px] font-normal text-[#475569]">Certificates never expire.</span></span>
              </label>
              <label className={OPTION}>
                <input type="radio" name="validity_kind" value="fixed" checked={kind === 'fixed'} onChange={() => setKind('fixed')} className="mt-0.5 accent-[#022C51]" />
                <span>Fixed length<span className="block text-[12px] font-normal text-[#475569]">Expiry is counted from the date achieved.</span></span>
              </label>
            </div>
            {kind === 'fixed' && (
              <div className="flex items-end gap-3">
                <div className="w-28">
                  <label htmlFor="validity_value" className={LABEL}>Length</label>
                  <input id="validity_value" name="validity_value" type="number" min={1} max={120} required defaultValue={v?.validity_value ?? type?.validity_value ?? 2} className={INPUT} />
                </div>
                <div className="w-40">
                  <label htmlFor="validity_unit" className={LABEL}>Unit</label>
                  <select id="validity_unit" name="validity_unit" defaultValue={v?.validity_unit ?? type?.validity_unit ?? 'years'} className={INPUT}>
                    <option value="months">months</option>
                    <option value="years">years</option>
                  </select>
                </div>
              </div>
            )}
          </fieldset>

          <fieldset className={SECTION} aria-describedby="period-hint">
            <legend className="sr-only">{TYPE_TEXT.periodLabel}</legend>
            <h2 className={SECTION_TITLE} aria-hidden="true">{TYPE_TEXT.periodLabel}</h2>
            <p id="period-hint" className={`${HINT} -mt-1`}>{TYPE_TEXT.periodHint}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="offered_from" className={LABEL}>{TYPE_TEXT.offeredFromLabel} <span className="text-[#DC2626]">*</span></label>
                <div className="relative">
                  {locked ? (
                    <input id="offered_from" name="offered_from" type="date" readOnly aria-readonly="true" value={type?.offered_from ?? ''} aria-describedby="from-hint" className={LOCKED_INPUT} />
                  ) : (
                    <input id="offered_from" name="offered_from" type="date" required value={from} onChange={e => setFrom(e.target.value)} aria-describedby="from-hint" className={INPUT} />
                  )}
                  {locked && <LockIcon />}
                </div>
                <p id="from-hint" className={HINT}>{locked ? TYPE_TEXT.lockedHint : TYPE_TEXT.offeredFromHint}</p>
              </div>
              <div>
                <label htmlFor="offered_until" className={LABEL}>{TYPE_TEXT.offeredUntilLabel}</label>
                <input id="offered_until" name="offered_until" type="date" min={untilMin || undefined} defaultValue={v?.offered_until ?? type?.offered_until ?? ''} aria-describedby="until-hint" className={INPUT} />
                <p id="until-hint" className={HINT}>
                  {TYPE_TEXT.offeredUntilHint}{latest ? ` It can’t be earlier than ${formatCertDate(latest)}, the latest date achieved on an issued certificate.` : ''} It stops new certificates only; existing ones stay as they are. To stop existing certificates, retire the type instead.
                </p>
              </div>
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isPending} className={PRIMARY_BTN}>
            {isPending ? 'Saving…' : editing ? 'Save changes' : 'Create type'}
          </button>
        </div>
      </form>
    </FormCard>
  )
}
