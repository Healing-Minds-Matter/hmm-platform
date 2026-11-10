'use client'

import { useActionState } from 'react'
import { confirmAccountEmailAction } from '@/actions/email-change'

const CARD = 'w-full max-w-[480px] rounded-2xl bg-white p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] ring-1 ring-[#E5E7EB]'
const PRIMARY = 'flex h-10 w-full items-center justify-center rounded-lg bg-[#F4AC1E] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#E09B0F] disabled:opacity-60'

function Result({ title, body, ok }: { title: string; body: string; ok: boolean }) {
  return (
    <div className={`${CARD} text-center`}>
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${ok ? 'bg-green-100 text-green-700' : 'bg-red-50 text-[#DC2626]'}`}>
        {ok ? '✓' : '!'}
      </div>
      <h1 className="mb-2 text-[20px] font-bold text-[#0F172A]">{title}</h1>
      <p className="text-[14px] leading-6 text-[#475569]">{body}</p>
    </div>
  )
}

export function ConfirmAccountEmailForm({ token }: { token: string | null }) {
  const [state, formAction, isPending] = useActionState(confirmAccountEmailAction, null)

  if (state?.status === 'done') {
    return <Result ok title="Email address confirmed" body="This is now the sign-in email for your Healing Minds Matter account. Use it next time you sign in." />
  }
  if (state?.status === 'taken') {
    return <Result ok={false} title="Email already in use" body="This address already belongs to another Healing Minds Matter account, so the change wasn't made. Please contact your administrator." />
  }
  if (state?.status === 'error') {
    return <Result ok={false} title="Something went wrong" body="The email couldn't be changed. Please ask your administrator to send a new link." />
  }
  if (!token || state?.status === 'invalid') {
    return <Result ok={false} title="Link invalid or expired" body="This link is invalid, has expired, has been replaced by a newer one, or has already been used. Your sign-in email has not been changed by it." />
  }

  return (
    <div className={CARD}>
      <h1 className="mb-2 text-[20px] font-bold text-[#0F172A]">Confirm your new sign-in email</h1>
      <p className="mb-6 text-[14px] leading-6 text-[#475569]">
        Your Healing Minds Matter administrator asked to make this address the sign-in email of your account. If you
        expected this, press <span className="font-semibold text-[#0F172A]">Confirm</span>. If not, just close this
        page — nothing will change.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={isPending} className={PRIMARY}>
          {isPending ? 'Confirming…' : 'Confirm'}
        </button>
      </form>
    </div>
  )
}
