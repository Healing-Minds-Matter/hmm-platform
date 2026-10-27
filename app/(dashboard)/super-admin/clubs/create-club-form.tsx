'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClubAction } from '@/actions/clubs'
import { BulkTabLabel, ModeTabs } from '@/components/mode-tabs'
import { BulkClubUpload } from './bulk-club-upload'

export function CreateClubForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/clubs'))
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [state, formAction, isPending] = useActionState(createClubAction, null)
  // Values sent back with an error (see createClubAction), so a failed save
  // keeps what was typed instead of clearing the whole form.
  const v = state?.values

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#0F172A]">Create New Club</h1>
          <p className="text-[12px] text-[#64748B]">
            Set up a new club chapter and designate facility details.
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

      <ModeTabs
        label="How to add clubs"
        idPrefix="create-club"
        value={mode}
        onChange={setMode}
        tabs={[
          { value: 'single', label: 'Single Club' },
          { value: 'bulk', label: <BulkTabLabel /> },
        ]}
      />

      <div
        id="create-club-panel"
        role="tabpanel"
        aria-labelledby={`create-club-tab-${mode}`}
        className="flex flex-1 flex-col overflow-hidden"
      >
      {mode === 'bulk' ? (
        <BulkClubUpload onClose={close} />
      ) : (
      <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {state.error}
            </div>
          )}

          {/* Section: Club Identification */}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <h2 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B]">
              Club Identification
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Club Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  defaultValue={v?.name}
                  type="text"
                  required
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
              <div>
                <label htmlFor="club_code" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Club Code / ID <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="club_code"
                  name="club_code"
                  defaultValue={v?.club_code}
                  type="text"
                  required
                  placeholder="e.g. CLB-007"
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 font-mono text-sm text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-normal focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
                <p className="mt-1.5 text-[11px] text-[#94A3B8]">Unique identifier — cannot be changed after creation.</p>
              </div>
            </div>
          </div>

          {/* Section: Location & Contact Details */}
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <h2 className="border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B]">
              Location &amp; Contact Details
            </h2>

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
                  defaultValue={v?.location}
                  type="text"
                  required
                  className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                />
              </div>
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
                  defaultValue={v?.contact_email}
                    type="email"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
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
                  defaultValue={v?.contact_phone}
                    type="tel"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="description" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                defaultValue={v?.description}
                rows={3}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
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
            {!isPending && <img src="/icons/plus.svg" alt="" width={10.5} height={10.5} />}
            {isPending ? 'Creating…' : 'Create Club & Activate'}
          </button>
        </div>
      </form>
      )}
      </div>
    </div>
  )
}
