'use client'

// The message under a form field (sheet row 32). Place it right after the
// field; hooks/use-form-errors.tsx links the field to it via aria-describedby.
import { useFormErrorsContext } from '@/hooks/use-form-errors'

export function FieldError({ name, className = '' }: { name: string; className?: string }) {
  const ctx = useFormErrorsContext()
  const message = ctx?.errors[name]
  if (!ctx || !message) return null
  return (
    <p id={ctx.errorId(name)} className={`mt-1.5 text-[12px] font-medium leading-4 text-[#DC2626] ${className}`}>
      {message}
    </p>
  )
}
