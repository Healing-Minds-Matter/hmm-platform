'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { resetPasswordAction } from '@/actions/auth'
import { useSubmitWithoutReset } from '@/hooks/use-submit-without-reset'
import { checkPasswordRules } from '@/lib/password-validation'
import { FormErrorsProvider, useFormErrors } from '@/hooks/use-form-errors'
import { FieldError } from '@/components/field-error'
import { formLevelError } from '@/lib/form-errors'

type RuleKey = 'minLength' | 'case' | 'hasNumber' | 'hasSpecial'

const RULES: { key: RuleKey; label: string }[] = [
  { key: 'minLength', label: '8+ characters' },
  { key: 'case',     label: 'Upper & lowercase' },
  { key: 'hasNumber', label: 'One number' },
  { key: 'hasSpecial', label: 'One symbol' },
]

function getRuleChecks(password: string): Record<RuleKey, boolean> {
  const r = checkPasswordRules(password)
  return {
    minLength:  r.minLength,
    case:       r.hasUppercase && r.hasLowercase,
    hasNumber:  r.hasNumber,
    hasSpecial: r.hasSpecial,
  }
}

function strengthLevel(checks: Record<RuleKey, boolean>): { segs: number; label: string } {
  const n = Object.values(checks).filter(Boolean).length
  if (n <= 1) return { segs: 0, label: '' }
  if (n === 2) return { segs: 1, label: 'Weak' }
  if (n === 3) return { segs: 2, label: 'Medium' }
  return { segs: 3, label: 'Strong' }
}

type PasswordFormAction = typeof resetPasswordAction

// Also used for a set-password link (Review Finding 2, /auth/set-up-account):
// same fields and rules, different wording, and the link token sent along.
export function ResetPasswordForm({
  email,
  loginPath,
  action = resetPasswordAction,
  token,
  heading = 'Reset password',
  intro = 'Choose a strong password for your account.',
  accountLabel = 'Resetting password for',
  submitLabel = 'Update password',
}: {
  email: string
  /** Shown as "Back to sign in" when set. */
  loginPath?: string
  action?: PasswordFormAction
  token?: string
  heading?: string
  intro?: string
  accountLabel?: string
  submitLabel?: string
}) {
  const [state, formAction, isPending] = useActionState(action, null)
  const fe = useFormErrors(state)
  const { bindForm, onSubmit: checkThen } = fe
  // Submitted without React's automatic reset, so a refused save keeps what was typed.
  const submit = useSubmitWithoutReset(formAction)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const checks = getRuleChecks(password)
  const { segs, label } = strengthLevel(checks)

  return (
    <div className="rounded-3xl bg-white p-10 shadow-md">
      <h1 className="mb-1 text-3xl font-bold text-[#1B2B4A]">{heading}</h1>
      <p className="mb-8 text-sm text-gray-500">
        {intro}
      </p>
      {/* Makes it obvious which account this link belongs to — a reset link
          signs the browser in as that account, whoever was signed in before. */}
      <p className="-mt-6 mb-8 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {accountLabel} <span className="font-semibold text-[#1B2B4A]">{email}</span>
      </p>

      {formLevelError(state) && (
        <div className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line" role="alert">
          {formLevelError(state)}
        </div>
      )}

      <form ref={bindForm} noValidate onSubmit={checkThen(submit)} className="space-y-5">
      <FormErrorsProvider value={fe}>
        {token && <input type="hidden" name="token" value={token} />}
        {/* New password */}
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1B2B4A] transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={showPassword ? '/icons/pw-eye-off.svg' : '/icons/pw-eye.svg'} alt="" className="h-4 w-4" />
            </button>
          </div>
          <FieldError name="password" className="whitespace-pre-line" />

          {/* Strength bar */}
          {password.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1.5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all ${
                      i <= segs ? 'bg-[#F5A623]' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              {label && (
                <span className="text-xs font-semibold text-[#F5A623]">{label}</span>
              )}
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">
            Confirm new password
          </label>
          <div className="relative">
            <input
              id="confirm"
              name="confirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              required
              placeholder="••••••••••"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11 text-sm outline-none transition focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1B2B4A] transition-colors"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={showConfirm ? '/icons/pw-eye-off.svg' : '/icons/pw-eye.svg'} alt="" className="h-4 w-4" />
            </button>
          </div>
          <FieldError name="confirm" />
        </div>

        {/* 2×2 requirements grid */}
        {password.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {RULES.map(r => (
              <div key={r.key} className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    checks[r.key]
                      ? 'bg-[#F5A623] text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {checks[r.key] ? '✓' : '·'}
                </span>
                <span className={`text-xs ${checks[r.key] ? 'text-gray-700' : 'text-gray-400'}`}>
                  {r.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-[#F5A623] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E8941A] disabled:opacity-60"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
      </FormErrorsProvider>
      </form>

      {loginPath && <p className="mt-5 text-center text-sm text-gray-400">
        Remembered it?{' '}
        <Link
          href={loginPath}
          className="font-semibold text-[#1B2B4A] hover:text-[#F5A623] transition-colors"
        >
          Back to sign in
        </Link>
      </p>}
    </div>
  )
}
