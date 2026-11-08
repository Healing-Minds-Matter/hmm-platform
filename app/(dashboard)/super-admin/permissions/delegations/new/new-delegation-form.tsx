'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { createDelegationAction } from '@/actions/permissions'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export function NewDelegationForm({ users, onClose }: { users: UserOption[]; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/permissions/delegations'))
  const [state, formAction, isPending] = useActionState(createDelegationAction, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  const submit = useSubmitWithoutReset(formAction)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Create Delegation</h1>
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

      <form ref={bindForm} noValidate onSubmit={checkThen(submit)}>
      <FormErrorsProvider value={fe}>
        <div className="flex flex-col gap-5 bg-[#F8FAFC] p-6">
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formLevelError(state)}
            </div>
          )}

          <div>
            <label htmlFor="delegator_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Delegator (going on leave) <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="delegator_id"
              name="delegator_id"
              required
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="">Select a user…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
            <FieldError name="delegator_id" />
          </div>

          <div>
            <label htmlFor="delegate_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Delegate (covering) <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="delegate_id"
              name="delegate_id"
              required
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="">Select a user…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
            <FieldError name="delegate_id" />
            <p className="mt-1.5 text-[11px] text-[#94A3B8]">
              The delegate keeps their own access and additionally gains the delegator&apos;s full
              effective permission set for the period below.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="starts_at" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Start Date <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="starts_at"
                name="starts_at"
                type="date"
                required
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="starts_at" />
            </div>
            <div>
              <label htmlFor="ends_at" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                End Date <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="ends_at"
                name="ends_at"
                type="date"
                required
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="ends_at" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {isPending ? 'Creating…' : 'Create Delegation'}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-[#F1F5F9] px-5 py-2.5 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
        </div>
      </FormErrorsProvider>
      </form>
    </div>
  )
}
