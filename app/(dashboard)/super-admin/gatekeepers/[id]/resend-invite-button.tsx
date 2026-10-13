'use client'

import { useActionState, useState } from 'react'
import { resendGatekeeperInviteAction, type GatekeeperActionState } from '@/actions/gatekeepers'

// Renamed from the earlier invite-link version of this component — this
// now generates a genuinely NEW temp password every time (see
// lib/invite-gatekeeper.ts's resendGatekeeperWelcomeEmail), which
// silently invalidates whatever password the Gatekeeper is currently
// using, including one they've already changed to themselves. That's a
// real enough consequence to need the same inline "Sure? Yes/No" confirm
// pattern already used elsewhere in this app, not a single-click action.
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
        <span className="text-xs font-medium text-[#0F172A]">Reset their password &amp; resend?</span>
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
        Resend Welcome Email
      </button>
      {state?.success && <span className="text-xs font-medium text-[#059669]">Sent.</span>}
      {state?.error && <span className="text-xs font-medium text-[#DC2626]">{state.error}</span>}
    </div>
  )
}
