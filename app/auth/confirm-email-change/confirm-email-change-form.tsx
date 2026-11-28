'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { confirmEmailChangeAction } from '@/actions/auth'

const CARD = 'w-full max-w-[480px] rounded-2xl bg-white p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] ring-1 ring-[#E5E7EB]'
const PRIMARY = 'flex h-10 w-full items-center justify-center rounded-lg bg-[#F4AC1E] px-5 text-[14px] font-semibold text-on-amber transition-colors hover:bg-[#E09B0F] disabled:opacity-60'

function Result({ title, body, tone, href, cta }: {
  title: string; body: string; tone: 'success' | 'info' | 'error'; href?: string; cta?: string
}) {
  const badge = tone === 'success' ? 'bg-green-100 text-green-700' : tone === 'info' ? 'bg-[#EFF4FF] text-[#1E4BB8]' : 'bg-red-50 text-[#DC2626]'
  return (
    <div className={`${CARD} text-center`}>
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${badge}`}>
        {tone === 'success' ? '✓' : tone === 'info' ? '1/2' : '!'}
      </div>
      <h1 className="mb-2 text-[20px] font-bold text-[#0F172A]">{title}</h1>
      <p className="text-[14px] leading-6 text-[#475569]">{body}</p>
      {href && cta && (
        <Link href={href} className={`${PRIMARY} mt-6`}>{cta}</Link>
      )}
    </div>
  )
}

export function ConfirmEmailChangeForm({ tokenHash }: { tokenHash: string | null }) {
  const [state, formAction, isPending] = useActionState(confirmEmailChangeAction, null)

  if (!tokenHash || state?.status === 'error') {
    return (
      <Result
        tone="error"
        title="Link invalid or expired"
        body="This confirmation link is invalid, has expired, or has already been used. Your sign-in email has not been changed by this link. You can start a new change from My Profile → Security & Sign-in."
        href="/login"
        cta="Go to sign in"
      />
    )
  }

  if (state?.status === 'partial') {
    return (
      <Result
        tone="info"
        title="One of two confirmations received"
        body="Now open the confirmation email sent to your other address and press Confirm there too. Your sign-in email changes only after both are confirmed."
      />
    )
  }

  if (state?.status === 'done') {
    return state.signedIn ? (
      <Result
        tone="success"
        title="Sign-in email changed"
        body="Both addresses are confirmed. Use your new email next time you sign in."
        href="/super-admin/profile"
        cta="Back to My Profile"
      />
    ) : (
      <Result
        tone="success"
        title="Sign-in email changed"
        body="Both addresses are confirmed. Sign in with your new email from now on."
        href="/login"
        cta="Go to sign in"
      />
    )
  }

  return (
    <div className={CARD}>
      <h1 className="mb-2 text-[20px] font-bold text-[#0F172A]">Confirm email change</h1>
      <p className="mb-6 text-[14px] leading-6 text-[#475569]">
        Someone asked to change the sign-in email of a Healing Minds Matter Super Admin account, and this
        address was sent a confirmation. If that was you, press <span className="font-semibold text-[#0F172A]">Confirm</span>.
        If it wasn&apos;t, just close this page — nothing will change.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <button type="submit" disabled={isPending} className={PRIMARY}>
          {isPending ? 'Confirming…' : 'Confirm'}
        </button>
      </form>
    </div>
  )
}
