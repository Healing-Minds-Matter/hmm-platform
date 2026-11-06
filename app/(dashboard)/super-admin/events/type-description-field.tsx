'use client'

// Sheet row 43: when the event type is "Other", a short description of the
// type is required. Shown wherever the type is shown (eventTypeLabel).
import { FieldError } from '@/components/field-error'

export function TypeDescriptionField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <div>
      <label htmlFor="type_description" className="mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
        Describe the event type <span className="text-[#DC2626]">*</span>
      </label>
      <input
        id="type_description"
        name="type_description"
        type="text"
        required
        maxLength={120}
        autoComplete="off"
        defaultValue={defaultValue ?? ''}
        placeholder="e.g. Parent information evening"
        className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
      />
      <FieldError name="type_description" />
    </div>
  )
}
