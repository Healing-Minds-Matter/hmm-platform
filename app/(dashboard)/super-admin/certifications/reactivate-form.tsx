'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { reactivateTypeAction } from '@/actions/certification-types'
import { formatCertDate, programmeEnded, programmePeriodLabel, type CertificationTypeRow } from '@/lib/certification-types'
import { CANCEL_BTN, FormCard, HINT, INPUT, LABEL, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

// Reactivate a retired type (Story 10.2 Sc06, Sc07).
export function ReactivateForm({ type, stopped, today, inModal = false }: {
  type: CertificationTypeRow
  stopped: number
  today: string
  inModal?: boolean
}) {
  const router = useRouter()
  const close = inModal ? () => router.back() : (() => router.push(`/super-admin/certifications/${type.id}`))
  const [state, formAction, isPending] = useActionState(reactivateTypeAction, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  // Submitted without React's automatic reset, so a refused save keeps every choice (radios included).
  const onSubmit = useSubmitWithoutReset(formAction)
  const v = state?.values
  const [from, setFrom] = useState(v?.from ?? today)
  // Reactivating on (or before) the retirement date cancels the retirement, so
  // nothing stays stopped; a later date keeps stopped certificates stopped.
  const cancels = !!type.retire_on && !!from && from <= type.retire_on
  const certs = `${stopped} ${stopped === 1 ? 'certificate' : 'certificates'}`

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <FormCard
      title={`Reactivate ${type.name}`}
      subtitle={`Retired on ${formatCertDate(type.retire_on)}. Reactivating lets it be awarded again and its certificate design be edited.`}
      onClose={close}
    >
      <form ref={bindForm} noValidate onSubmit={checkThen(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
      <FormErrorsProvider value={fe}>
        <input type="hidden" name="type_id" value={type.id} />
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {formLevelError(state) && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{formLevelError(state)}</div>}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div className="max-w-[260px]">
              <label htmlFor="from" className={LABEL}>Offered again from <span className="text-[#DC2626]">*</span></label>
              <input id="from" name="from" type="date" min={today} required value={from} onChange={e => setFrom(e.target.value)} className={INPUT} autoFocus />
              <FieldError name="from" />
            </div>
            {programmeEnded(type, from || today) && (
              <p role="note" className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-[13px] text-[#92400E]">
                The programme period ended on {formatCertDate(type.offered_until)}, so no new certificates can be added even after reactivating. To award it again, change Offered until with Edit.
              </p>
            )}
            <p className={HINT}>The programme period ({programmePeriodLabel(type)}) doesn’t change. Use Edit to change it.</p>
            <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-[13px]">
              <b className="block text-[#0F172A]">Existing certificates</b>
              <span className="text-[#475569]">
                {type.retirement_option !== 'stop'
                  ? 'Certificates were kept valid at retirement, so nothing changes for them.'
                  : cancels
                  ? `Reactivating from the retirement date (${formatCertDate(type.retire_on)}) cancels the retirement, so the ${certs} that stopped ${stopped === 1 ? 'becomes' : 'become'} valid again.`
                  : `${certs} stopped when the type retired. They stay stopped; holders can be renewed to become valid again.`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isPending} className={PRIMARY_BTN}>{isPending ? 'Saving…' : 'Reactivate type'}</button>
        </div>
      </FormErrorsProvider>
      </form>
    </FormCard>
  )
}
