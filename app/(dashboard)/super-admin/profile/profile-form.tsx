'use client'

import { useActionState, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { updateProfileAction } from '@/actions/profile'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (Primary)' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
]

export function ProfileForm({
  initialFullName,
  initialTitle,
  initialPhone,
  initialLanguage,
  initialOfficeLocation,
  email,
}: {
  initialFullName: string
  initialTitle: string
  initialPhone: string
  initialLanguage: string
  initialOfficeLocation: string
  email: string
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  const submit = useSubmitWithoutReset(formAction)
  const [copied, setCopied] = useState(false)

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently no-op,
      // the email is already visible and selectable in the field itself.
    }
  }

  return (
    <form ref={bindForm} noValidate onSubmit={checkThen(submit)} className="flex flex-col gap-4">
    <FormErrorsProvider value={fe}>
      {formLevelError(state) && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {formLevelError(state)}
        </div>
      )}
      {state?.success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          Profile updated successfully.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
          Full Legal &amp; Professional Name
        </label>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/c2-name-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2" />
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            maxLength={100}
            defaultValue={initialFullName}
            className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3.5 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
          />
        </div>
        <FieldError name="full_name" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
          Job Title
        </label>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/c2-jobtitle-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-[14.25px] w-[15px] -translate-y-1/2" />
          <input
            id="title"
            name="title"
            type="text"
            maxLength={150}
            defaultValue={initialTitle}
            placeholder="e.g. Clinical Oversight Director"
            className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3.5 text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
          />
        </div>
        <FieldError name="title" />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">Email Address (Sign-in ID)</span>
          <span className="flex items-center gap-1 text-[11px] text-[#64748B]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/c2-sso-shield.svg" alt="" className="h-[11.375px] w-[8.667px]" />
            Sign-in Email
          </span>
        </div>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/c2-email-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-[15px] -translate-y-1/2" />
          <input
            readOnly
            value={email}
            className="h-10 w-full cursor-not-allowed rounded-lg border border-[#E5E7EB] bg-[rgba(241,245,249,0.8)] pl-9 pr-16 text-[13px] text-[#475569] focus:outline-none"
          />
          <button
            type="button"
            onClick={copyEmail}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] text-[#003495] shadow-sm hover:bg-slate-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-[#94A3B8]">Used for sign-in — change it under Security &amp; Sign-in.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
            Direct Phone
          </label>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/c2-phone-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-[13.5px] w-[13.5px] -translate-y-1/2" />
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={initialPhone}
              placeholder="+1 (555) 234-5678"
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3.5 text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            />
          </div>
          <FieldError name="phone" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="preferred_language" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
            Language
          </label>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/c2-language-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2" />
            <select
              id="preferred_language"
              name="preferred_language"
              defaultValue={initialLanguage}
              className="h-10 w-full appearance-none rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              {LANGUAGE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/c2-chevron-down.svg" alt="" className="pointer-events-none absolute right-3 top-1/2 h-[5.55px] w-[9px] -translate-y-1/2" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="office_location" className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
          Office Location
        </label>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/c2-office-field.svg" alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-[13.5px] w-[13.5px] -translate-y-1/2" />
          <input
            id="office_location"
            name="office_location"
            type="text"
            maxLength={200}
            defaultValue={initialOfficeLocation}
            placeholder="e.g. Central Administrative Annex, Suite 400"
            className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3.5 text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
          />
        </div>
        <FieldError name="office_location" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="reset"
          className="rounded-lg bg-white px-[17px] py-[9px] text-[12px] font-semibold tracking-[0.24px] text-[#475569] ring-1 ring-[#E5E7EB] transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-[5px] bg-[#F4AC1E] px-5 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/c2-save-icon.svg" alt="" className="h-[9.019px] w-[12.225px]" />
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </FormErrorsProvider>
    </form>
  )
}
