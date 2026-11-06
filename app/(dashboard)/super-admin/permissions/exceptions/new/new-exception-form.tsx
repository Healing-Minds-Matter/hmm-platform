'use client'

import { useActionState, useEffect } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { grantIndividualExceptionAction } from '@/actions/permissions'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export function NewExceptionForm({ users, onClose }: { users: UserOption[]; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/permissions/exceptions'))
  const [state, formAction, isPending] = useActionState(grantIndividualExceptionAction, null)
  const submit = useSubmitWithoutReset(formAction)

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Grant Individual Exception</h1>
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

      <form onSubmit={submit}>
        <div className="flex flex-col gap-5 bg-[#F8FAFC] p-6">
          {state?.error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {state.error}
            </div>
          )}

          <div>
            <label htmlFor="user_id" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              User <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="user_id"
              name="user_id"
              required
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="">Select a user…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
            {users.length === 0 && (
              <p className="mt-1.5 text-[11px] text-[#94A3B8]">No active Champions or Gatekeepers exist yet.</p>
            )}
          </div>

          <div>
            <label htmlFor="permission" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Permission Key <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="permission"
              name="permission"
              type="text"
              required
              placeholder="e.g. download_facilitator_kits"
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 font-mono text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            />
          </div>

          <div>
            <label htmlFor="is_enabled" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Setting <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="is_enabled"
              name="is_enabled"
              required
              defaultValue="true"
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="true">Allow</option>
              <option value="false">Deny</option>
            </select>
            <p className="mt-1.5 text-[11px] text-[#94A3B8]">
              This overrides both the user&apos;s Group and Role default settings for this permission only.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#F4AC1E] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {isPending ? 'Granting…' : 'Grant Exception'}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-[#F1F5F9] px-5 py-2.5 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
