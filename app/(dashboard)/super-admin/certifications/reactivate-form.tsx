'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { reactivateTypeAction } from '@/actions/certification-types'
import { formatCertDate, type CertificationTypeRow } from '@/lib/certification-types'
import { CANCEL_BTN, FormCard, HINT, INPUT, LABEL, PRIMARY_BTN } from '@/components/certifications/cert-ui'

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
  const v = state?.values

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <FormCard
      title={`Reactivate ${type.name}`}
      subtitle={`Retired on ${formatCertDate(type.offered_until)}. Reactivating lets it be awarded again and its certificate design be edited.`}
      onClose={close}
    >
      <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
        <input type="hidden" name="type_id" value={type.id} />
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="from" className={LABEL}>Offered again from <span className="text-[#DC2626]">*</span></label>
                <input id="from" name="from" type="date" min={today} required defaultValue={v?.from ?? today} className={INPUT} autoFocus />
              </div>
              <div>
                <label htmlFor="until" className={LABEL}>Offered until</label>
                <input id="until" name="until" type="date" min={today} defaultValue={v?.until ?? ''} className={INPUT} />
                <p className={HINT}>Optional. Leave empty for no end date.</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-[13px]">
              <b className="block text-[#0F172A]">Existing certificates</b>
              <span className="text-[#475569]">
                {type.retirement_option === 'stop'
                  ? `${stopped} ${stopped === 1 ? 'certificate' : 'certificates'} stopped when the type retired. They stay stopped; holders can be renewed to become valid again.`
                  : 'Certificates were kept valid at retirement, so nothing changes for them.'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isPending} className={PRIMARY_BTN}>{isPending ? 'Saving…' : 'Reactivate type'}</button>
        </div>
      </form>
    </FormCard>
  )
}
