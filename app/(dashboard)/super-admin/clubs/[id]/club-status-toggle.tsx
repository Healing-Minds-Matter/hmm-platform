'use client'

import { useState, useTransition } from 'react'
import { deactivateClubAction, reactivateClubAction } from '@/actions/clubs'

export function ClubStatusToggle({ clubId, isActive }: { clubId: string; isActive: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className={`rounded-lg border bg-white px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors ${
          isActive
            ? 'border-[#FCA5A5] text-[#DC2626] hover:bg-red-50'
            : 'border-[#86EFAC] text-[#16A34A] hover:bg-green-50'
        }`}
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    )
  }

  const action = isActive ? deactivateClubAction : reactivateClubAction
  const label  = isActive ? 'Deactivate' : 'Reactivate'
  const warning = isActive
    ? 'This will restrict access for all Champions and Gatekeepers in this club.'
    : 'This will restore access for all Champions and Gatekeepers deactivated when the club was closed.'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-sm">
      <div className="max-w-xs space-y-1">
        <p className="text-xs text-[#475569]">{warning}</p>
        {error && <p role="alert" className="text-xs font-semibold text-[#DC2626]">{error}</p>}
      </div>
      <form
        action={(fd) => startTransition(async () => {
          setError(null)
          const result = await action(fd)
          if (result && 'error' in result) setError(result.error)
          else setConfirm(false)
        })}
        className="flex gap-2"
      >
        <input type="hidden" name="club_id" value={clubId} />
        <button
          type="submit"
          disabled={isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
            isActive ? 'bg-[#DC2626] hover:bg-red-700' : 'bg-[#16A34A] hover:bg-green-700'
          }`}
        >
          {isPending ? '…' : `Yes, ${label}`}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-gray-50"
        >
          Cancel
        </button>
      </form>
    </div>
  )
}
