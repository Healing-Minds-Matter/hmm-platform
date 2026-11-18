'use client'

import { useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { loginAction } from '@/actions/auth'
import { FORGOT_PASSWORD_PATH } from '@/lib/portals'

const PORTAL_SUBTITLE = {
  super_admin: 'For Super Admin',
  champion: 'For Champion',
} as const

export function LoginForm({ portal }: { portal: 'super_admin' | 'champion' }) {
  const [state, formAction, isPending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'
  const errorParam = searchParams.get('error')
  const sessionExpired = errorParam === 'session_expired'
  const forcedLogoutMessage =
    errorParam === 'club_inactive' ? 'Your club is currently inactive. Please contact your administrator.' :
    errorParam === 'account_inactive' ? 'Your account has been deactivated. Please contact an administrator.' :
    null

  const hasBanner = resetSuccess || sessionExpired || forcedLogoutMessage || state?.error

  return (
    <div className="w-full font-[family-name:var(--font-inter)]">
      <div className="flex flex-col gap-[7px]">
        {/* app/globals.css has a plain (unlayered) `h1 { font-family:
            var(--font-jakarta); font-weight:700; letter-spacing:-0.035em }`
            rule for generic page headings elsewhere in the app. Unlayered
            CSS always beats every Tailwind utility class regardless of
            source order or specificity, so this <h1> was silently stuck on
            Jakarta/700/-0.035em no matter what classes were applied here —
            confirmed live via getComputedStyle (fontFamily read back as
            Jakarta, fontWeight 700, letterSpacing -1.19px = -0.035em*34px).
            The `!` modifier forces these three properties to actually win,
            scoped to just this heading — not touching the shared global
            rule, which many other real headings across the app depend on
            (several already have their own tracking values that are
            currently silently overridden the same way, but fixing that
            globally is a much bigger, unreviewed change than what was
            asked for here). */}
        <h1 className="font-[family-name:var(--font-inter)]! text-[28px] font-black! leading-none tracking-[0.28px]! text-[#012C51] sm:text-[34px] sm:tracking-[0.34px]!">
          Login
        </h1>
        <p className="text-[15px] leading-[1.56] tracking-[0.15px] text-[#67707F] sm:text-[18px] sm:tracking-[0.18px]">
          {PORTAL_SUBTITLE[portal]}
        </p>
      </div>

      {hasBanner && (
        <div className="mt-4 flex flex-col gap-3 sm:mt-6">
          {resetSuccess && (
            <div className="rounded-lg bg-[#E6FFE7] px-4 py-3 text-sm text-[#16A34A]">
              Password reset successfully. Please sign in with your new password.
            </div>
          )}
          {sessionExpired && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-[#D97706]">
              Your session expired due to inactivity. Please sign in again.
            </div>
          )}
          {forcedLogoutMessage && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#DC2626]">
              {forcedLogoutMessage}
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
        <div className="flex flex-col gap-[9px]">
          <div className="flex flex-col gap-[24px]">
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

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-[16px] tracking-[0.16px] text-[#0C1421]">
                Password
              </label>
              <div className="relative">
                {/* Figma's own spec for this field is text-14px, but an
                    input's REAL font-size (not just its placeholder) has to
                    stay >=16px or iOS Safari auto-zooms the whole page on
                    focus (a WebKit accessibility behavior for tiny inputs,
                    not a bug in this app) — that's what made the field look
                    like it "changed size on click". Kept the base text at
                    16px (matching Email) and overrode just the ::placeholder
                    pseudo-element to 14px, so the placeholder still matches
                    Figma exactly and real typed characters (which render as
                    dots anyway) don't need to. */}
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-lg border border-[#D4D7E3] bg-[#FCFDFF] px-4 pr-11 text-[16px] tracking-[0.16px] text-[#0C1421] outline-none transition placeholder:text-[14px] placeholder:tracking-[0.14px] placeholder:text-[#8897AD] focus:border-[#F4AC1E] focus:ring-2 focus:ring-[#F4AC1E]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8897AD] hover:text-[#67707F]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {/* Figma's node 144:56 is literally named "basil:eye-closed-outline"
                      — a real icon from the Basil Iconify set, 24x24, shown paired
                      with the masked/dotted password field. The open-eye counterpart
                      (basil:eye-outline) isn't a separate node in this static mockup
                      — Figma can only show one interactive state — but it's the same
                      icon set's real, verified companion icon (fetched from the same
                      public Iconify registry Figma's own layer name references), not
                      hand-drawn. Previously this used a differently-shaped, non-square
                      icon pair forced into a 16px square box (h-4 w-4) with
                      preserveAspectRatio="none", which stretched it into a distorted
                      blob — Figma's icon is a clean 24x24 square, so sizing it at its
                      real dimensions (h-6 w-6) needs no distorting stretch. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showPassword ? '/icons/basil-eye-outline.svg' : '/icons/basil-eye-closed-outline.svg'}
                    alt=""
                    className="h-6 w-6"
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex cursor-pointer items-center gap-[7px]">
              <span className="relative inline-block size-[18px] shrink-0">
                <input
                  type="checkbox"
                  name="keep_signed_in"
                  className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/checkbox-unchecked.svg"
                  alt=""
                  className="absolute inset-0 size-full peer-checked:opacity-0"
                />
                <span className="absolute inset-0 hidden items-center justify-center rounded-[3px] bg-[#F4AC1E] peer-checked:flex">
                  <svg viewBox="0 0 12 10" className="h-[7px] w-[9px]" fill="none" aria-hidden="true">
                    <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
              <span className="text-[14px] tracking-[0.14px] text-[#67707F]">Keep me signed in</span>
            </label>
            <Link
              href={FORGOT_PASSWORD_PATH[portal]}
              className="text-[14px] font-bold tracking-[0.14px] text-[#265BA2] hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-[#F4AC1E] py-4 text-[18px] font-semibold tracking-[0.18px] text-white transition hover:bg-[#e0991a] disabled:opacity-60"
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
