'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { retireTypeAction } from '@/actions/certification-types'
import { formatCertDate, type CertificationTypeRow, type RetirementOption } from '@/lib/certification-types'
import { CANCEL_BTN, DANGER_BTN, FormCard, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN } from '@/components/certifications/cert-ui'

// Retire a type, or change a retirement (Story 10.2 Sc01, Sc02, Sc05).
export function RetireForm({ type, impact, today, inModal = false }: {
  type: CertificationTypeRow
  impact: { holders: number; validNow: number }
  today: string
  inModal?: boolean
}) {
  const router = useRouter()
  const close = inModal ? () => router.back() : (() => router.push(`/super-admin/certifications/${type.id}`))
  const [state, formAction, isPending] = useActionState(retireTypeAction, null)
  // Submitted without React's automatic reset, so a refused save keeps every choice (radios included).
  const onSubmit = useSubmitWithoutReset(formAction)
  const inEffect = type.status === 'retired'
  const existing = !!type.open_retirement_id
  const [option, setOption] = useState<RetirementOption>((state?.values?.option as RetirementOption | undefined) ?? type.retirement_option ?? 'keep')
  const [on, setOn] = useState(state?.values?.retire_on ?? type.retire_on ?? today)
  const lifetime = type.validity_value == null

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const future = on > today
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
  return (
    <FormCard
      title={existing ? `Change retirement · ${type.name}` : `Retire ${type.name}`}
      subtitle={inEffect
        ? `Retired on ${formatCertDate(type.retire_on)}. You can still change what happens to holders; the change is recorded in the audit history.`
        : 'No one can receive this type after the retirement date, and you choose what happens to existing certificates. Nothing is deleted. This is separate from the programme’s Offered until date, which only stops new certificates.'}
      onClose={close}
    >
      <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
        <input type="hidden" name="type_id" value={type.id} />
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{state.error}</div>}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            {inEffect ? (
              <input type="hidden" name="retire_on" value={type.retire_on ?? ''} />
            ) : (
              <div className="max-w-[260px]">
                <label htmlFor="retire_on" className={LABEL}>Retirement date <span className="text-[#DC2626]">*</span></label>
                <input id="retire_on" name="retire_on" type="date" min={today} required value={on} onChange={e => setOn(e.target.value)} className={INPUT} autoFocus />
              </div>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-medium text-[#0F172A]">
                What happens to the {impact.holders} {plural(impact.holders, 'person', 'people')} who hold it? <span className="text-[#DC2626]">*</span>
              </legend>
              <label className={OPTION}>
                <input type="radio" name="option" value="keep" checked={option === 'keep'} onChange={() => setOption('keep')} className="mt-0.5 accent-[#022C51]" />
                <span>Keep existing certificates valid<span className="block text-[12px] font-normal text-[#64748B]">{lifetime ? 'They stay valid for life.' : 'Each stays valid until its own expiry date.'}</span></span>
              </label>
              <label className={OPTION}>
                <input type="radio" name="option" value="stop" checked={option === 'stop'} onChange={() => setOption('stop')} className="mt-0.5 accent-[#022C51]" />
                <span>Stop existing certificates<span className="block text-[12px] font-normal text-[#64748B]">All certificates of this type stop being valid from the retirement date.</span></span>
              </label>
            </fieldset>
            <div role="status" className={`rounded-xl border p-3.5 text-[13px] ${option === 'stop' && impact.validNow ? 'border-[#FDE68A] bg-[#FFFBEB]' : 'border-[#DBEAFE] bg-[#EFF6FF]'}`}>
              {option === 'stop'
                ? <><b className="text-[#0F172A]">{impact.validNow} {plural(impact.validNow, 'certificate that is', 'certificates that are')} valid now will stop being valid {future ? `on ${formatCertDate(on)}` : 'straight away'}.</b><span className="block text-[#475569]">They’ll show as “Stopped (programme retired)”.</span></>
                : <b className="text-[#0F172A]">{impact.validNow} valid {plural(impact.validNow, 'certificate stays', 'certificates stay')} valid until {plural(impact.validNow, 'it expires', 'they expire')}.</b>}
            </div>
            {!inEffect && future && <p className={HINT}>Before the date, the type shows as “Active · retires {formatCertDate(on)}”.</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={isPending} className={option === 'stop' ? DANGER_BTN : PRIMARY_BTN}>
            {isPending ? 'Saving…' : existing ? 'Save' : 'Retire type'}
          </button>
        </div>
      </form>
    </FormCard>
  )
}
