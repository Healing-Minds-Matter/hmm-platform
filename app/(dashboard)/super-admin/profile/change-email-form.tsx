'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { requestEmailChangeAction } from '@/actions/auth'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

// Same shell/typography as ChangePasswordForm, so the two Security & Sign-in
// popups look like a pair.
export function ChangeEmailForm({
  currentEmail,
  pendingEmail = null,
  onClose,
}: {
  currentEmail: string
  // A change already awaiting confirmation. A new request replaces it (and
  // Supabase issues new links), so say so before the user sends another.
  pendingEmail?: string | null
  onClose?: () => void
}) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(requestEmailChangeAction, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  // Submitted without React's automatic reset, so a refused save keeps what was typed.
  const submit = useSubmitWithoutReset(formAction)
  const [showPassword, setShowPassword] = useState(false)

  // Refresh the profile underneath so its Sign-in Email row shows "pending".
  useEffect(() => {
    if (state?.success) router.refresh()
  }, [state, router])

  const closeControl = (label: string, primary = false) => {
    const className = primary
      ? 'flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#E09B0F]'
      : 'flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]'
    return onClose ? (
      <button type="button" onClick={onClose} className={className}>{label}</button>
    ) : (
      <Link href="/super-admin/profile" className={className}>{label}</Link>
    )
  }

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-7 tracking-[-0.22px] text-[#0F172A]">
            {state?.success ? 'Confirm your new email' : 'Change Sign-in Email'}
          </h1>
          <p className="max-w-[440px] text-[13px] leading-[18px] text-[#475569]">
            {state?.success
              ? 'Your sign-in email has not changed yet.'
              : 'This is the email you use to sign in and where password reset links are sent.'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
          </button>
        )}
      </div>

      {state?.success ? (
        <>
          <div className="flex flex-col gap-3 bg-[#F8FAFC] p-6 text-[13px] leading-5 text-[#475569]">
            <p>We&apos;ve sent a confirmation link to <span className="font-semibold text-[#0F172A]">both</span> addresses:</p>
            <ul className="flex flex-col gap-1 rounded-xl bg-white p-4 ring-1 ring-[#E5E7EB]">
              <li>Current: <span className="font-semibold text-[#0F172A]">{currentEmail}</span></li>
              <li>New: <span className="font-semibold text-[#0F172A]">{state.newEmail}</span></li>
            </ul>
            <p>
              Click the link in <span className="font-semibold text-[#0F172A]">each</span> email. Your sign-in email
              changes only after both are confirmed — until then, keep signing in with your current email.
            </p>
            <p className="text-[12px] text-[#64748B]">
              Didn&apos;t ask for this? Don&apos;t click either link; your email will stay the same.
            </p>
          </div>
          <div className="flex items-center justify-end border-t border-[#E2E8F0] px-6 py-4">
            {closeControl('Done', true)}
          </div>
        </>
      ) : (
        <form ref={bindForm} noValidate onSubmit={checkThen(submit)} className="flex flex-1 flex-col overflow-hidden">
        <FormErrorsProvider value={fe}>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
            {formLevelError(state) && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{formLevelError(state)}</div>
            )}

            {pendingEmail && (
              <div className="rounded-lg border border-[#FDE68A] bg-amber-50 p-3 text-[13px] leading-5 text-[#92400E]" role="note">
                You have a pending change to <span className="font-semibold">{pendingEmail}</span>. Sending new
                links will cancel it, and the links already sent will stop working.
              </div>
            )}

            <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">Current Email</span>
                <p className="flex h-10 items-center rounded-lg border border-[#E5E7EB] bg-[rgba(241,245,249,0.8)] px-3 text-[13px] text-[#475569]">
                  {currentEmail}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="newEmail" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  New Email <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="newEmail"
                  name="newEmail"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@healingmindsmatter.org"
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
                <FieldError name="newEmail" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="currentPassword" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  Current Password <span className="text-[#DC2626]">*</span>
                </label>
                <div className="relative">
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-3 pr-10 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={showPassword ? '/icons/pw-eye-off.svg' : '/icons/pw-eye.svg'} alt="" className="h-4 w-4" />
                  </button>
                </div>
                <FieldError name="currentPassword" />
                <p className="text-[11px] text-[#94A3B8]">Required to confirm it&apos;s really you.</p>
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(0,52,149,0.1)] bg-[#EFF4FF] p-[13px] text-[12px] leading-[19.5px] text-[#475569]">
              <span className="font-semibold text-[#0F172A]">How this works:</span> we&apos;ll email a confirmation link to
              both your current and your new address. Your email changes only after both links are clicked.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
            {closeControl('Cancel')}
            <button
              type="submit"
              disabled={isPending}
              className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
            >
              {isPending ? 'Sending…' : 'Send Confirmation Links'}
            </button>
          </div>
        </FormErrorsProvider>
        </form>
      )}
    </div>
  )
}
