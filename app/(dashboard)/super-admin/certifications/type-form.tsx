'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { createTypeAction, updateTypeAction } from '@/actions/certification-types'
import { formatCertDate, type CertificationTypeRow } from '@/lib/certification-types'
import { CANCEL_BTN, FormCard, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN, SECTION, SECTION_TITLE } from '@/components/certifications/cert-ui'

// New / Edit certification type (Story 10.1), as a pop-up or a full page.
export function TypeForm({ type, codeLocked = false, today, inModal = false }: {
  type?: CertificationTypeRow
  codeLocked?: boolean
  today: string
  inModal?: boolean
}) {
  const router = useRouter()
  const editing = !!type
  const close = inModal ? () => router.back() : (() => router.push(editing ? `/super-admin/certifications/${type.id}` : '/super-admin/certifications'))
  const [state, formAction, isPending] = useActionState(editing ? updateTypeAction : createTypeAction, null)
  // Submitted without React's automatic reset, so a refused save keeps every choice (radios included).
  const onSubmit = useSubmitWithoutReset(formAction)
  const v = state?.values
  const retired = type?.status === 'retired'

  const [kind, setKind] = useState<'lifetime' | 'fixed'>(
    (v?.validity_kind as 'lifetime' | 'fixed' | undefined) ?? (type ? (type.validity_value == null ? 'lifetime' : 'fixed') : 'fixed')
  )
  const [until, setUntil] = useState(v?.offered_until ?? type?.offered_until ?? '')

  useEffect(() => {
    if (!state?.success) return
    if (editing) close()
    else router.push(`/super-admin/certifications/${state.id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <FormCard
      title={editing ? `Edit ${type.name}` : 'New certification type'}
      subtitle={editing ? 'Changes to validity apply to new certificates only; existing ones keep the expiry they were given.' : 'Define a certification HMM recognises. Its digital certificate design can be added afterwards.'}
      onClose={close}
    >
      <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
        {editing && <input type="hidden" name="id" value={type.id} />}
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>}

          <div className={SECTION}>
            <h2 className={SECTION_TITLE}>Certification</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className={LABEL}>Name <span className="text-[#DC2626]">*</span></label>
                <input id="name" name="name" required maxLength={120} defaultValue={v?.name ?? type?.name} placeholder="e.g. Psychological First Aid" className={INPUT} autoFocus />
              </div>
              <div>
                <label htmlFor="code" className={LABEL}>Code <span className="text-[#DC2626]">*</span></label>
                <input id="code" name="code" required maxLength={12} defaultValue={v?.code ?? type?.code} readOnly={codeLocked} placeholder="e.g. PFA" aria-describedby="code-hint" className={`${INPUT} font-mono uppercase`} />
                <p id="code-hint" className={HINT}>{codeLocked ? 'Can’t be changed: this type has already been awarded.' : 'Letters, numbers and hyphens. Used in certificate numbers. Fixed once awarded.'}</p>
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

          <fieldset className={SECTION}>
            <legend className="sr-only">Validity</legend>
            <h2 className={SECTION_TITLE} aria-hidden="true">Validity <span className="text-[#DC2626]">*</span></h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={OPTION}>
                <input type="radio" name="validity_kind" value="lifetime" checked={kind === 'lifetime'} onChange={() => setKind('lifetime')} className="mt-0.5 accent-[#022C51]" />
                <span>Lifetime<span className="block text-[12px] font-normal text-[#64748B]">Certificates never expire.</span></span>
              </label>
              <label className={OPTION}>
                <input type="radio" name="validity_kind" value="fixed" checked={kind === 'fixed'} onChange={() => setKind('fixed')} className="mt-0.5 accent-[#022C51]" />
                <span>Fixed length<span className="block text-[12px] font-normal text-[#64748B]">Expiry is counted from the date achieved.</span></span>
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

          <div className={SECTION}>
            <h2 className={SECTION_TITLE}>Offered</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="offered_from" className={LABEL}>Offered from <span className="text-[#DC2626]">*</span></label>
                <input id="offered_from" name="offered_from" type="date" required defaultValue={v?.offered_from ?? type?.offered_from ?? today} className={INPUT} />
              </div>
              <div>
                <label htmlFor="offered_until" className={LABEL}>Offered until (retirement date)</label>
                {retired ? (
                  <>
                    <input id="offered_until" type="text" readOnly value={formatCertDate(type?.offered_until)} className={INPUT} />
                    <p className={HINT}>Already retired. Use Change retirement or Reactivate on the type’s page.</p>
                  </>
                ) : (
                  <>
                    <input id="offered_until" name="offered_until" type="date" min={today} value={until} onChange={e => setUntil(e.target.value)} aria-describedby="until-hint" className={INPUT} />
                    <p id="until-hint" className={HINT}>Optional. No one can receive this type after this date.</p>
                  </>
                )}
              </div>
            </div>
            {!retired && (
              <fieldset disabled={!until} className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-medium text-[#0F172A]">On the retirement date, existing certificates…</legend>
                <div className="grid grid-cols-2 gap-3">
                  <label className={OPTION}>
                    <input type="radio" name="retire_option" value="keep" defaultChecked={(v?.retire_option || type?.retirement_option || 'keep') === 'keep'} className="mt-0.5 accent-[#022C51]" />
                    <span>Stay valid<span className="block text-[12px] font-normal text-[#64748B]">Each until its own expiry date.</span></span>
                  </label>
                  <label className={OPTION}>
                    <input type="radio" name="retire_option" value="stop" defaultChecked={(v?.retire_option || type?.retirement_option) === 'stop'} className="mt-0.5 accent-[#022C51]" />
                    <span>Stop being valid<span className="block text-[12px] font-normal text-[#64748B]">All of them, on the retirement date.</span></span>
                  </label>
                </div>
                {!until && <p className={HINT}>Choose an Offered until date first.</p>}
              </fieldset>
            )}
          </div>
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
