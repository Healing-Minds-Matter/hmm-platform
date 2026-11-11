'use client'

import { useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { forgotPasswordAction } from '@/actions/auth'
import { LOGIN_PATH, type Portal } from '@/lib/portals'

// No Figma frame exists anywhere in this file for a Forgot Password page
// (confirmed via a full metadata scan of the document's only page — its
// section list has no Forgot/Reset Password entry at all, only "sign in"
// for Login). With no real spec to pull instead, this reuses Login's own
// verified layout/typography values directly (login-form.tsx) rather than
// inventing new ones — per an explicit request to match Login exactly
// where nothing else calls for something different. Previously this page
// had its own nested `rounded-3xl bg-white p-10 shadow-md` card, which
// floated visibly inside the shared (auth) layout's own white panel —
// Login has no such nested card, so this is removed; content now sits
// flat on the panel exactly like Login's does.
//
// Shared by both portals (/forgot-password for Super Admins,
// /champion/forgot-password for Champions) — the hidden "portal" field tells
// forgotPasswordAction which role this page is allowed to email.
function ForgotPasswordFormInner({ portal }: { portal: Portal }) {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, null)
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('error') === 'link_expired'

  if (state?.sent) {
    return (
      <div className="w-full text-center font-[family-name:var(--font-inter)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl">
          ✓
        </div>
        <h1 className="font-[family-name:var(--font-inter)]! text-[28px] font-black! leading-none tracking-[0.28px]! text-[#012C51] sm:text-[34px] sm:tracking-[0.34px]!">
          Check your email
        </h1>
        <p className="mt-[7px] text-[15px] leading-[1.56] tracking-[0.15px] text-[#67707F] sm:text-[18px] sm:tracking-[0.18px]">
          If this email is registered, a password reset link has been sent. Please check
          your inbox and follow the instructions.
        </p>
        <Link
          href={LOGIN_PATH[portal]}
          className="mt-8 inline-block text-[14px] font-bold tracking-[0.14px] text-[#265BA2] hover:underline sm:mt-10"
        >
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full font-[family-name:var(--font-inter)]">
      <Link
        href={LOGIN_PATH[portal]}
        className="mb-[7px] inline-flex items-center gap-1 text-[14px] tracking-[0.14px] text-[#67707F] hover:text-[#0C1421]"
      >
        ← Back to sign in
      </Link>

      <div className="flex flex-col gap-[7px]">
        <h1 className="font-[family-name:var(--font-inter)]! text-[28px] font-black! leading-none tracking-[0.28px]! text-[#012C51] sm:text-[34px] sm:tracking-[0.34px]!">
          Forgot password
        </h1>
        <p className="text-[15px] leading-[1.56] tracking-[0.15px] text-[#67707F] sm:text-[18px] sm:tracking-[0.18px]">
          Enter your registered email and we&apos;ll send a link to reset your password.
        </p>
      </div>

      {(linkExpired || state?.error) && (
        <div className="mt-4 flex flex-col gap-3 sm:mt-6">
          {linkExpired && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#DC2626]" role="alert">
              Your reset link has expired or has already been used. Please request a new one.
            </div>
          )}
          {state?.error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#DC2626]" role="alert">
              {state.error}
            </div>
          )}
        </div>
      )}

      <form action={formAction} className="mt-8 flex flex-col gap-[60px] sm:mt-10">
        <input type="hidden" name="portal" value={portal} />
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[16px] tracking-[0.16px] text-[#0C1421]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@healingmindsmatter.org"
            className="h-12 w-full rounded-lg border border-[#D4D7E3] bg-[#FCFDFF] px-4 text-[16px] tracking-[0.16px] text-[#0C1421] outline-none transition placeholder:text-[#8897AD] focus:border-[#F4AC1E] focus:ring-2 focus:ring-[#F4AC1E]/20"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-[#F4AC1E] py-4 text-[18px] font-semibold tracking-[0.18px] text-white transition hover:bg-[#e0991a] disabled:opacity-60"
        >
          {isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-[14px] tracking-[0.14px] text-[#D97706]">
        The reset link expires in 15 minutes. Check your spam folder if it doesn&apos;t arrive
        within a few minutes.
      </div>
    </div>
  )
}

export function ForgotPasswordForm({ portal }: { portal: Portal }) {
  return (
    <Suspense>
      <ForgotPasswordFormInner portal={portal} />
    </Suspense>
  )
}
