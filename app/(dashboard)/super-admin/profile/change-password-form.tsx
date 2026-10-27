'use client'

import { startTransition, useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { changePasswordAction, signOutToForgotPasswordAction } from '@/actions/auth'
import { checkPasswordRules } from '@/lib/password-validation'

const RULES = [
  { key: 'minLength',    label: 'Minimum 8 characters in length' },
  { key: 'hasUppercase', label: 'At least one uppercase letter (A-Z)' },
  { key: 'hasLowercase', label: 'At least one lowercase letter (a-z)' },
  { key: 'hasNumber',    label: 'At least one numeric digit (0-9)' },
  { key: 'hasSpecial',   label: 'At least one special symbol (!@#$%^&*)' },
] as const

// Honest tiers derived from the same real rules already enforced server-side
// — no "Enterprise-grade" marketing language, this app has no certification
// to back that claim.
function strengthTier(passedCount: number) {
  if (passedCount <= 1) return { label: 'Weak', segments: 1, color: '#DC2626' }
  if (passedCount <= 2) return { label: 'Fair', segments: 2, color: '#D97706' }
  if (passedCount <= 4) return { label: 'Good', segments: 3, color: '#CA8A04' }
  return { label: 'Strong', segments: 4, color: '#16A34A' }
}

function PasswordInput({
  id,
  name,
  value,
  onChange,
  icon,
  ringClass,
  autoCompleteOverride,
}: {
  id: string
  name: string
  value?: string
  onChange?: (v: string) => void
  icon: string
  ringClass?: string
  autoCompleteOverride?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required
        autoComplete={autoCompleteOverride ?? (name === 'currentPassword' ? 'current-password' : 'new-password')}
        value={value}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        className={`h-10 w-full rounded-lg border bg-[#F8FAFC] pl-9 pr-10 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8] ${ringClass ?? 'border-[#E2E8F0]'}`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569]"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={visible ? '/icons/pw-eye-off.svg' : '/icons/pw-eye.svg'} alt="" className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ChangePasswordForm({
  onClose,
  mode = 'elective',
  redirectTo,
  profilePath = '/super-admin/profile',
}: {
  onClose?: () => void
  // 'forced' is the first-login "Set Your Password" screen reached via
  // must_change_password — same underlying changePasswordAction (it's the
  // one that actually clears that flag on success), just different framing
  // since there's nowhere for a "Cancel" button to go and success means an
  // immediate redirect rather than closing a modal or showing a static card.
  mode?: 'elective' | 'forced'
  redirectTo?: string
  profilePath?: string
}) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(changePasswordAction, null)

  function goToForgotPassword() {
    const ok = window.confirm("You'll be signed out so you can reset your password by email. Continue?")
    if (ok) startTransition(() => signOutToForgotPasswordAction())
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const rules = checkPasswordRules(newPassword)
  const passedCount = Object.values(rules).filter(Boolean).length
  const tier = strengthTier(passedCount)
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword

  useEffect(() => {
    if (!state?.success) return
    if (mode === 'forced') {
      router.push(redirectTo ?? '/login')
      return
    }
    if (onClose) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (state?.success && mode !== 'forced' && !onClose) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl">✓</div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Password changed</h2>
        <p className="mb-6 text-sm text-gray-500">
          Your password has been updated. If you did not make this change, please contact support immediately.
        </p>
        <Link href={profilePath} className="text-sm text-blue-600 hover:text-blue-700">← Back to profile</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-7 tracking-[-0.22px] text-[#0F172A]">
            {mode === 'forced' ? 'Set Your Password' : 'Change Account Password'}
          </h1>
          <p className="max-w-[480px] text-[13px] leading-[18px] text-[#475569]">
            {mode === 'forced'
              ? 'Your account was created with a temporary password. Set a real password before continuing — you won’t be able to access anything else until you do.'
              : 'Update your administrative login credentials to maintain data security across the Healing Minds Matter portal.'}
          </p>
        </div>
        {onClose && mode !== 'forced' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
          </button>
        )}
      </div>

      <form action={formAction} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {state?.error && (
            <div className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {state.error}
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="currentPassword" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                  {mode === 'forced' ? 'Temporary Password' : 'Current Password'} <span className="text-[#DC2626]">*</span>
                </label>
                {/* Used to link straight to /forgot-password, which bounces
                    signed-in users back to their dashboard — so it never
                    worked. It now signs out and opens the user's own portal's
                    forgot-password page (signOutToForgotPasswordAction). */}
                <button
                  type="button"
                  onClick={goToForgotPassword}
                  className="text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:underline"
                >
                  {mode === 'forced' ? "Didn't get one?" : 'Forgot current password?'}
                </button>
              </div>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                icon="/icons/pw-key-field.svg"
                value={currentPassword}
                onChange={setCurrentPassword}
                // A temp password (mode="forced") was never typed/saved in
                // this browser before — there's no legitimate saved
                // credential to autofill, and "current-password" invites
                // Chrome to silently fill in an OLD saved password for
                // this origin instead (this project's own domain has a lot
                // of saved-password history from repeated testing). That's
                // a real, confirmed bug: cross-referenced a live "Password
                // change failed" report against Vercel runtime logs and the
                // DB — the account's real temp password (proven to work at
                // the login step 30s earlier) didn't match what actually
                // got submitted here, with no code path in between that
                // could have changed it. Left as current-password for the
                // elective (real "change my password") mode, where
                // autofilling the user's actual saved password is
                // legitimate, wanted behavior.
                // "off" doesn't reliably work here — Chrome has ignored
                // autocomplete="off" on password fields since ~2014
                // specifically to stop sites from blocking its password
                // manager. "new-password" is the actual effective token:
                // Chrome only ever suggests a NEW generated password for
                // it (or leaves it blank), never autofills an old saved
                // one — already proven safe in this exact form, since the
                // newPassword/confirm fields use it and don't hit this bug.
                autoCompleteOverride={mode === 'forced' ? 'new-password' : undefined}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="newPassword" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                New Password <span className="text-[#DC2626]">*</span>
              </label>
              <PasswordInput id="newPassword" name="newPassword" icon="/icons/pw-lock-field.svg" value={newPassword} onChange={setNewPassword} />
              {newPassword.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-[0.44px] text-[#64748B]">Password Strength:</span>
                    <span className="flex items-center gap-1 text-[11px] font-bold tracking-[0.44px]" style={{ color: tier.color }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/pw-strength-shield.svg" alt="" className="h-[11.667px] w-[9.333px]" />
                      {tier.label}
                    </span>
                  </div>
                  <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-[#E6EEFF]">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="h-full flex-1 rounded-full" style={{ backgroundColor: i < tier.segments ? tier.color : 'transparent' }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[rgba(226,232,240,0.8)] bg-[rgba(239,244,255,0.6)] p-[15px]">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Password Requirements</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {RULES.map(r => (
                  <div key={r.key} className="flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/icons/pw-checklist-check.svg"
                      alt=""
                      className="h-[12.5px] w-[12.5px] flex-shrink-0"
                      style={{ opacity: rules[r.key] ? 1 : 0.35 }}
                    />
                    <span className={`text-[12px] ${rules[r.key] ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>{r.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/pw-checklist-check.svg" alt="" className="h-[12.5px] w-[12.5px] flex-shrink-0" style={{ opacity: 0.6 }} />
                  <span className="text-[12px] text-[#64748B]">Cannot match last 5 previous passwords</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-[13px] font-medium tracking-[0.24px] text-[#0F172A]">
                Confirm New Password <span className="text-[#DC2626]">*</span>
              </label>
              <PasswordInput
                id="confirm"
                name="confirm"
                icon="/icons/pw-confirm-check-field.svg"
                value={confirmPassword}
                onChange={setConfirmPassword}
                ringClass={passwordsMatch ? 'border-[rgba(22,163,74,0.6)]' : 'border-[#E2E8F0]'}
              />
              {passwordsMatch && (
                <span className="flex items-center gap-1 text-[12px] text-[#16A34A]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/pw-match-check.svg" alt="" className="h-[12.25px] w-[12.833px]" />
                  Passwords match successfully
                </span>
              )}
            </div>

            <div className="flex gap-2.5 rounded-xl border border-[rgba(0,52,149,0.1)] bg-[#EFF4FF] p-[13px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pw-banner-shield.svg" alt="" className="h-[17px] w-3 flex-shrink-0" />
              <p className="text-[12px] leading-[19.5px] text-[#475569]">
                <span className="font-semibold text-[#0F172A]">Session Revocation Guarantee:</span> Updating your password
                will keep your current session active, but will automatically sign out all other active sessions and
                devices for safety.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          {mode === 'forced' ? null : onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
            >
              Cancel
            </button>
          ) : (
            <Link
              href={profilePath}
              className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
            >
              Cancel
            </Link>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/pw-update-btn-lock.svg" alt="" className="h-[15.75px] w-3" />
            {isPending ? 'Saving…' : mode === 'forced' ? 'Set Password' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  )
}
