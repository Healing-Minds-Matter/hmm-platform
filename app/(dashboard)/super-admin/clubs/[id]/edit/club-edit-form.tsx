'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { updateClubAction } from '@/actions/clubs'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

interface Club {
  id: string
  club_code: string | null
  name: string
  location: string
  description: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
}

export function ClubEditForm({ club, onClose }: { club: Club; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push(`/super-admin/clubs/${club.id}`))
  const [state, formAction, isPending] = useActionState(updateClubAction, null)
  const fe = useFormErrors(state)
  const { formRef } = fe
  const submit = useSubmitWithoutReset(formAction)
  const isActive = club.is_active

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto w-full max-w-[672px] overflow-hidden rounded-2xl bg-white shadow-[0_12px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#0F172A]">Edit Club Details</h1>
            {club.club_code && (
              <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 font-mono text-[12px] font-semibold text-[#475569]">
                ID: {club.club_code}
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#475569]">
            Update basic information, primary facility, and operational status for {club.name}.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
          aria-label="Close"
        >
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>

      <form ref={formRef} noValidate onSubmit={fe.onSubmit(submit)}>
      <FormErrorsProvider value={fe}>
        <input type="hidden" name="club_id" value={club.id} />

        <div className="flex flex-col gap-6 bg-[#F8FAFC] p-6">
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formLevelError(state)}
            </div>
          )}

          {/* Section: Club Information */}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <img src="/icons/club-info.svg" alt="" width={15} height={13.5} />
              <h2 className="font-[family-name:var(--font-jakarta)] text-[15px] font-semibold text-[#0F172A]">
                Club Information
              </h2>
            </div>

            <div>
              <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Club Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={club.name}
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="name" />
            </div>

            <div>
              <label htmlFor="location" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Primary Venue &amp; Physical Address <span className="text-[#DC2626]">*</span>
              </label>
              <div className="relative">
                <img
                  src="/icons/map-pin.svg"
                  alt=""
                  width={10.5}
                  height={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                />
                <input
                  id="location"
                  name="location"
                  type="text"
                  required
                  defaultValue={club.location}
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <FieldError name="location" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact_email" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Contact Email
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
                    id="contact_email"
                    name="contact_email"
                    type="email"
                    defaultValue={club.contact_email ?? ''}
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <FieldError name="contact_email" />
              </div>
              <div>
                <label htmlFor="contact_phone" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
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
                    id="contact_phone"
                    name="contact_phone"
                    type="tel"
                    defaultValue={club.contact_phone ?? ''}
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <FieldError name="contact_phone" />
              </div>
            </div>

            <div>
              <label htmlFor="description" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={club.description ?? ''}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
              <FieldError name="description" />
            </div>
          </div>

          {/* Section: Operational Status */}
          <div className="flex flex-col gap-3 rounded-xl bg-white p-5">
            <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
              <img src="/icons/shield-check.svg" alt="" width={16.5} height={15.75} />
              <h2 className="font-[family-name:var(--font-jakarta)] text-[15px] font-semibold text-[#0F172A]">
                Operational Status
              </h2>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-[#F8FAFC] p-3.5">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: isActive ? '#0D8275' : '#DC2626',
                  boxShadow: `0 0 0 4px ${isActive ? 'rgba(13,130,117,0.2)' : 'rgba(220,38,38,0.15)'}`,
                }}
              />
              <div>
                <p className="text-[14px] font-semibold text-[#0F172A]">
                  Status: {isActive ? 'Active Chapter' : 'Inactive Chapter'}
                </p>
                <p className="mt-0.5 text-[12px] text-[#475569]">
                  {isActive
                    ? 'Operational for gatekeeper certification and club activity.'
                    : 'Not currently operational — Champion and Gatekeeper access is paused.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <img src="/icons/info-circle.svg" alt="" width={12.5} height={12.5} />
              <p className="text-[12px] text-[#64748B]">
                {isActive
                  ? 'Deactivating temporarily pauses active member access while safeguarding all institutional records.'
                  : 'Reactivating restores access only for members who were deactivated when this club was closed.'}
              </p>
            </div>
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
            disabled={isPending}
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
