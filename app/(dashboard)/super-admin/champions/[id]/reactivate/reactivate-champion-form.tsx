'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { reactivateChampionAction } from '@/actions/champions'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

interface Champion { id: string; full_name: string; email: string; club_id: string | null }
interface Club { id: string; name: string; is_active?: boolean }

export function ReactivateChampionForm({
  champion,
  currentClub,
  activeClubs,
  onClose,
}: {
  champion: Champion
  currentClub: Club | null
  activeClubs: Club[]
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(`/super-admin/champions/${champion.id}`))
  const [state, formAction, isPending] = useActionState(reactivateChampionAction, null)
  const fe = useFormErrors(state)
  const { formRef } = fe
  const submit = useSubmitWithoutReset(formAction)
  const clubIsInactive = currentClub && !currentClub.is_active

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Reactivate Champion</h1>
          <p className="text-[12px] leading-[16px] text-[#64748B]">{champion.full_name} · {champion.email}</p>
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

      <form ref={formRef} noValidate onSubmit={fe.onSubmit(submit)}>
      <FormErrorsProvider value={fe}>
        <input type="hidden" name="champion_id" value={champion.id} />
        <div className="flex flex-col gap-4 bg-[#F8FAFC] p-6">
          {clubIsInactive && (
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
              <strong>{currentClub.name}</strong> is currently inactive. Assign an active club below before reactivating.
            </div>
          )}
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formLevelError(state)}
            </div>
          )}

          <div className="rounded-xl bg-white p-5">
            <label htmlFor="club_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Club Assignment <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="club_id"
              name="club_id"
              required
              defaultValue={!clubIsInactive ? (champion.club_id ?? '') : ''}
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="">Select a club…</option>
              {activeClubs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FieldError name="club_id" />
            <p className="mt-1.5 text-[11px] text-[#94A3B8]">
              Confirm or change the club before restoring access.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#0D8275] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#0B6E63] disabled:opacity-60"
          >
            {isPending ? 'Reactivating…' : 'Reactivate Champion'}
          </button>
        </div>
      </FormErrorsProvider>
      </form>
    </div>
  )
}
