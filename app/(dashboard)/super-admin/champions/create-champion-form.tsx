'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createChampionAction } from '@/actions/champions'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

interface Club { id: string; name: string }

export function CreateChampionForm({ clubs, onClose }: { clubs: Club[]; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/champions'))
  const [state, formAction, isPending] = useActionState(createChampionAction, null)
  const fe = useFormErrors(state)
  const { formRef } = fe
  const submit = useSubmitWithoutReset(formAction)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Add New Champion</h1>
          <p className="text-[12px] leading-[16px] text-[#64748B]">
            Create an account and assign a program coordinator to a club.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
        >
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>

      <form ref={formRef} noValidate onSubmit={fe.onSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
      <FormErrorsProvider value={fe}>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formLevelError(state)}
            </div>
          )}

          {/* Section: Champion Information */}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <h2 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
              Champion Information
            </h2>

            <div>
              <label htmlFor="full_name" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Full Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                autoComplete="off"
                placeholder="e.g. Dr. Marcus Reed, MSW"
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="full_name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Contact Email <span className="text-[#DC2626]">*</span>
                </label>
                <div className="relative">
                  <img
                    src="/icons/mail.svg"
                    alt=""
                    width={15}
                    height={12}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="e.g. m.reed@healingminds.org"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <FieldError name="email" />
              </div>
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Contact Phone
                </label>
                <div className="relative">
                  <img
                    src="/icons/phone.svg"
                    alt=""
                    width={13.5}
                    height={13.5}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                  />
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+1 (555) 019-2834"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <FieldError name="phone" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="club_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Assigned Club <span className="text-[#DC2626]">*</span>
                </label>
                {clubs.length === 0 ? (
                  <p className="mt-1 text-[13px] text-[#DC2626]">
                    No active clubs available.{' '}
                    <Link href="/super-admin/clubs/new" className="underline">
                      Create a club first.
                    </Link>
                  </p>
                ) : (
                  <div className="relative">
                    <select
                      id="club_id"
                      name="club_id"
                      required
                      defaultValue=""
                      className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                    >
                      <option value="" disabled>Select an active club...</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <img
                      src="/icons/chevron-down.svg"
                      alt=""
                      width={10}
                      height={6.17}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                    />
                  </div>
                )}
                <FieldError name="club_id" />
              </div>
              <div>
                <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Institutional Title (optional)
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  placeholder="e.g. Clinical Coordinator"
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
                <FieldError name="title" />
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-xl bg-[rgba(220,233,255,0.6)] p-3">
            <img src="/icons/mail-banner.svg" alt="" width={17.5} height={17} className="mt-0.5 flex-shrink-0" />
            <p className="text-[12px] leading-[16.5px] text-[#475569]">
              An invitation and temporary login credentials will be automatically emailed to the champion upon
              creation. Single-club assignment is enforced on activation.
            </p>
          </div>
        </div>

        {/* Footer */}
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
            disabled={isPending || clubs.length === 0}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {!isPending && <img src="/icons/plus.svg" alt="" width={10.5} height={10.5} />}
            {isPending ? 'Sending Invite…' : 'Create & Send Invite'}
          </button>
        </div>
      </FormErrorsProvider>
      </form>
    </div>
  )
}
