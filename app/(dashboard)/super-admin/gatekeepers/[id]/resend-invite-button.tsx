'use client'

import { useActionState, useState } from 'react'
import { resendGatekeeperInviteAction, type GatekeeperActionState } from '@/actions/gatekeepers'

// Review Finding 2: only shown for a Gatekeeper who has never signed in.
// Emails a new single-use set-password link to their own address; earlier
// links (and any temporary password) stop working, hence the confirm step.
export function ResendInviteButton({ gatekeeperId }: { gatekeeperId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, isPending] = useActionState<GatekeeperActionState, FormData>(
    resendGatekeeperInviteAction,
    null
  )

  if (confirming) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="gatekeeper_id" value={gatekeeperId} />
        <span className="text-xs font-medium text-[#0F172A]">Send a new set-password link? Earlier links stop working.</span>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isPending ? 'Sending…' : 'Yes'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-[#D4D7E3] bg-white px-3 py-1.5 text-xs font-semibold text-[#022C51]"
        >
          No
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-lg border border-[#D4D7E3] bg-white px-4 py-2.5 text-xs font-semibold text-[#022C51] shadow-sm hover:bg-[#F8FAFC]"
      >
        Send Welcome Email
      </button>
      {state?.success && <span className="text-xs font-medium text-[#059669]">Sent.</span>}
      {state?.error && <span className="text-xs font-medium text-[#DC2626]">{state.error}</span>}
    </div>
  )
}
