'use client'

import { useId, useState, useTransition } from 'react'
import { updateRoleDefaultAction } from '@/actions/permissions'
import { saveRoleDefault } from '@/lib/role-default-save'

export function RoleDefaultToggle({
  role,
  permission,
  label,
  initialEnabled,
}: {
  role: 'champion' | 'gatekeeper'
  permission: string
  /** The permission's name, read out by screen readers (Fix L). */
  label: string
  initialEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const errorId = useId()

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setError(null)
    const fd = new FormData()
    fd.set('role', role)
    fd.set('permission', permission)
    fd.set('is_enabled', String(next))
    startTransition(async () => {
      const failure = await saveRoleDefault(updateRoleDefaultAction, fd)
      if (failure) {
        // Fix L: the save didn't happen, so put the switch back and say why.
        setEnabled(!next)
        setError(failure)
      }
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-[#F4AC1E]' : 'bg-[#E2E8F0]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {error && (
        <p id={errorId} role="alert" className="max-w-[220px] text-right text-[12px] leading-4 text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  )
}
