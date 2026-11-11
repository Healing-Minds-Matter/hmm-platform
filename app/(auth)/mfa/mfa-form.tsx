'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { recordMfaEnrolledAction } from '@/actions/mfa'
import { logoutAction } from '@/actions/auth'
import { safeNextPath } from '@/lib/auth/safe-next'

// Review Finding 8. Uses Supabase's own MFA (TOTP) API in the browser: the
// factor's secret is created and checked by Supabase, never by this app's
// server, and nothing about it is logged.

type Mode =
  | { kind: 'loading' }
  | { kind: 'enrol'; factorId: string; qrCode: string; secret: string }
  | { kind: 'verify'; factorId: string }
  | { kind: 'failed' }

const HEADING = 'font-[family-name:var(--font-inter)]! text-[28px] font-black! leading-none tracking-[0.28px]! text-[#012C51] sm:text-[34px] sm:tracking-[0.34px]!'
const INTRO = 'text-[15px] leading-[1.56] tracking-[0.15px] text-[#67707F] sm:text-[16px]'

export function MfaForm() {
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get('next'), '/super-admin')
  const [mode, setMode] = useState<Mode>({ kind: 'loading' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (!active) return
      if (listError) return setMode({ kind: 'failed' })
      const verified = data.totp.find(f => f.status === 'verified')
      if (verified) return setMode({ kind: 'verify', factorId: verified.id })

      // First time: remove any half-finished set-up, then start a new one.
      for (const f of data.all.filter(f => f.factor_type === 'totp' && f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 10)})`,
      })
      if (!active) return
      if (enrolError || !enrolled) return setMode({ kind: 'failed' })
      setMode({ kind: 'enrol', factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret })
    })()
    return () => { active = false }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode.kind !== 'enrol' && mode.kind !== 'verify') return
    setError(null)
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.')
    setIsPending(true)
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId: mode.factorId, code })
    if (verifyError) {
      setIsPending(false)
      setCode('')
      return setError('That code didn’t work. Codes change every 30 seconds — check the time on your phone is set automatically, then try the newest code.')
    }
    if (mode.kind === 'enrol') await recordMfaEnrolledAction()
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="w-full font-[family-name:var(--font-inter)]">
      <div className="flex flex-col gap-[7px]">
        <h1 className={HEADING}>{mode.kind === 'enrol' ? 'Set up two-step verification' : 'Two-step verification'}</h1>
        <p className={INTRO}>
          {mode.kind === 'enrol'
            ? 'Super Admin accounts need a code from an authenticator app (for example Google Authenticator or Microsoft Authenticator) as well as your password.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      {mode.kind === 'loading' && <p className="mt-8 text-sm text-[#67707F]" role="status">Loading…</p>}

      {mode.kind === 'failed' && (
        <div className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-[#DC2626]" role="alert">
          Two-step verification couldn’t be started. Please refresh the page or sign in again.
        </div>
      )}

      {mode.kind === 'enrol' && (
        <ol className="mt-6 flex list-decimal flex-col gap-3 pl-5 text-[14px] leading-[1.5] text-[#0C1421]">
          <li>Open your authenticator app and add a new account.</li>
          <li>
            Scan this QR code:
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mode.qrCode} alt="QR code to scan with your authenticator app" className="mt-2 h-44 w-44 rounded-lg border border-[#D4D7E3] bg-white p-2" />
            <span className="mt-2 block text-[13px] text-[#67707F]">
              Can’t scan it? Enter this key in the app instead:{' '}
              <code className="break-all rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[13px] text-[#0C1421]">{mode.secret}</code>
            </span>
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {(mode.kind === 'enrol' || mode.kind === 'verify') && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="mfa-code" className="text-[16px] tracking-[0.16px] text-[#0C1421]">6-digit code</label>
            <input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!!error}
              aria-describedby={error ? 'mfa-error' : undefined}
              className="h-12 w-full rounded-lg border border-[#D4D7E3] bg-[#FCFDFF] px-4 text-[16px] tracking-[0.3em] text-[#0C1421] outline-none transition focus:border-[#F4AC1E] focus:ring-2 focus:ring-[#F4AC1E]/20"
            />
            {error && <p id="mfa-error" role="alert" className="text-sm text-[#DC2626]">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-[#F4AC1E] py-4 text-[18px] font-semibold tracking-[0.18px] text-white transition hover:bg-[#e0991a] disabled:opacity-60"
          >
            {isPending ? 'Checking…' : mode.kind === 'enrol' ? 'Turn on two-step verification' : 'Verify'}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-3 text-[14px] text-[#67707F]">
        {mode.kind === 'verify' && (
          <p>Lost access to your authenticator app? Ask the person who manages the HMM Supabase project to reset your two-step verification, then sign in again to set it up on your new phone.</p>
        )}
        <form action={logoutAction}>
          <button type="submit" className="font-bold text-[#265BA2] hover:underline">Sign out</button>
        </form>
      </div>
    </div>
  )
}
