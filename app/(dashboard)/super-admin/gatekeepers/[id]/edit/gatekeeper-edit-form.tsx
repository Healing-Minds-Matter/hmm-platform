'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { updateGatekeeperAction } from '@/actions/gatekeepers'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'
import { EMAIL_CHANGE_HINT, EmailPendingNotice } from '@/components/email-pending-notice'

interface Gatekeeper {
  id: string
  full_name: string
  email: string
  phone: string | null
  preferred_language: string
  club_id: string | null
  version: number
}
interface Club { id: string; name: string; club_code: string | null }

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (Primary)' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
]

export function GatekeeperEditForm({
  gatekeeper,
  clubs,
  onClose,
}: {
  gatekeeper: Gatekeeper
  clubs: Club[]
  onClose?: () => void
}) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(`/super-admin/gatekeepers/${gatekeeper.id}`))
  const [state, formAction, isPending] = useActionState(updateGatekeeperAction, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  const submit = useSubmitWithoutReset(formAction)

  useEffect(() => {
    // An email change waits for the new address to confirm: keep the form open to say so.
    if (state?.success && !state.emailPending) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Edit Gatekeeper</h1>
          <p className="text-[12px] leading-[16px] text-[#64748B]">
            Update {gatekeeper.full_name}&apos;s information and club assignment.
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

      <form ref={bindForm} noValidate onSubmit={checkThen(submit)} className="flex flex-1 flex-col overflow-hidden">
      <FormErrorsProvider value={fe}>
        <input type="hidden" name="gatekeeper_id" value={gatekeeper.id} />
        <input type="hidden" name="version" value={gatekeeper.version} />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.conflict && (
            <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800" role="alert">
              This record was updated by another user while you were editing. Please{' '}
              <button type="button" onClick={() => window.location.reload()} className="underline">reload the latest version</button>{' '}
              and reapply your changes.
            </div>
          )}
          {state?.emailPending && <EmailPendingNotice email={state.emailPending} onDone={close} />}
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{formLevelError(state)}</div>
          )}

          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <h2 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
              Personal Details
            </h2>
            <div>
              <label htmlFor="full_name" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Full Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="full_name" name="full_name" type="text" required defaultValue={gatekeeper.full_name}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="full_name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Email Address <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="email" name="email" type="email" required defaultValue={gatekeeper.email}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
                <FieldError name="email" />
                <p className="mt-1.5 text-[11px] text-[#94A3B8]">{EMAIL_CHANGE_HINT}</p>
              </div>
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Phone Number <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="phone" name="phone" type="tel" required defaultValue={gatekeeper.phone ?? ''}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
                <FieldError name="phone" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="club_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Assigned Club <span className="text-[#DC2626]">*</span>
                </label>
                <div className="relative">
                  <select
                    id="club_id" name="club_id" required defaultValue={gatekeeper.club_id ?? ''}
                    className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  >
                    <option value="" disabled>Select an active club...</option>
                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}{c.club_code ? ` (${c.club_code})` : ''}</option>)}
                  </select>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
                </div>
                <FieldError name="club_id" />
              </div>
              <div>
                <label htmlFor="preferred_language" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Preferred Language
                </label>
                <div className="relative">
                  <select
                    id="preferred_language" name="preferred_language" defaultValue={gatekeeper.preferred_language}
                    className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  >
                    {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
                </div>
              </div>
            </div>
            <p className="rounded-lg bg-[#EFF6FF] px-3.5 py-2.5 text-[12px] text-[#265BA2]">
              Certifications are managed in the Certifications section of the Gatekeeper&apos;s profile.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={close} className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">
            Cancel
          </button>
          <button
            type="submit" disabled={isPending}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {!isPending && <img src="/icons/check.svg" alt="" width={11.55} height={8.52} />}
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </FormErrorsProvider>
      </form>
    </div>
  )
}
