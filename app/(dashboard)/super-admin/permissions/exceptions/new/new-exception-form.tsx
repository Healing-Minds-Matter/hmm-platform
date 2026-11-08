'use client'

import { useActionState, useState } from 'react'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { useRouter } from 'next/navigation'
import { grantIndividualExceptionAction } from '@/actions/permissions'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'
import { permissionCategoryTitle } from '@/lib/access-list'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export interface PermissionOption {
  key: string
  label: string
  category: string
  restricted_to: string | null
}

// Sheet row 60: one person, several permissions at once (from the same
// catalog and labels as the Permissions screens).
export function NewExceptionForm({ users, permissions, onClose }: { users: UserOption[]; permissions: PermissionOption[]; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/permissions/exceptions'))
  const [state, formAction, isPending] = useActionState(grantIndividualExceptionAction, null)
  const submit = useSubmitWithoutReset(formAction)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  const [setting, setSetting] = useState('true')
  const [chosen, setChosen] = useState<string[]>([])

  // Everything saved: close. Otherwise stay and show what was skipped or refused.
  const [seen, setSeen] = useState(state)
  if (state !== seen) {
    setSeen(state)
    if (state?.success && state.allSaved) close()
  }

  const categories = [...new Set(permissions.map(p => p.category))]
  const allowing = setting === 'true'
  const toggle = (key: string) => setChosen(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]))

  return (
    <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
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

      <form ref={bindForm} noValidate onSubmit={checkThen(submit)}>
      <FormErrorsProvider value={fe}>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto bg-[#F8FAFC] p-6">
          {formLevelError(state) && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formLevelError(state)}
            </div>
          )}
          {state?.summary && state.summary.length > 0 && (
            <div role="status" className={`rounded-lg p-3 text-[13px] ${state.success ? 'bg-[#E6FFE7] text-[#0D5F2E]' : 'bg-amber-50 text-[#92400E]'}`}>
              {state.summary.map(line => <p key={line}>{line}</p>)}
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
            <FieldError name="user_id" />
            {users.length === 0 && (
              <p className="mt-1.5 text-[11px] text-[#94A3B8]">No active Champions or Gatekeepers exist yet.</p>
            )}
          </div>

          <div>
            <label htmlFor="is_enabled" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Setting <span className="text-[#DC2626]">*</span>
            </label>
            <select
              id="is_enabled"
              name="is_enabled"
              required
              value={setting}
              onChange={e => setSetting(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            >
              <option value="true">Allow</option>
              <option value="false">Deny</option>
            </select>
            <p className="mt-1.5 text-[11px] text-[#94A3B8]">
              This overrides both the user&apos;s Group and Role default settings for each chosen permission.
            </p>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
              Permissions <span className="text-[#DC2626]">*</span>{' '}
              <span className="font-normal text-[#64748B]">({chosen.length} chosen)</span>
            </legend>
            <div className="flex flex-col gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3">
              {categories.map(cat => (
                <div key={cat}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{permissionCategoryTitle(cat)}</p>
                  {permissions.filter(p => p.category === cat).map(p => {
                    const locked = allowing && p.restricted_to === 'super_admin'
                    return (
                      <label key={p.key} className={`flex items-center gap-2 py-0.5 text-[13px] ${locked ? 'text-[#94A3B8]' : 'text-[#0F172A]'}`}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p.key}
                          disabled={locked}
                          checked={!locked && chosen.includes(p.key)}
                          onChange={() => toggle(p.key)}
                          className="h-4 w-4 flex-shrink-0 rounded border-[#D4D7E3]"
                        />
                        {p.label}
                        {locked && <span className="text-[11px]">(Super Admins only)</span>}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
            <FieldError name="permissions" />
            <p className="mt-1.5 text-[11px] text-[#94A3B8]">Permissions the person already has (or, for Deny, already doesn&apos;t) are skipped and listed after saving.</p>
          </fieldset>
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
            {state?.success ? 'Done' : 'Cancel'}
          </button>
        </div>
      </FormErrorsProvider>
      </form>
    </div>
  )
}
