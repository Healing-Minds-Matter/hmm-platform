export const metadata = { title: 'Reset your password — Healing Minds Matter' }

// Where a Gatekeeper's password-reset link lands if it is opened somewhere
// the Healing Minds Matter app can't take over (a computer, or a phone
// without the app). The link only works in the app on the phone that asked
// for it (Security Finding 9), so this page just says so. It reads nothing
// from the URL.
export default function MobileResetPasswordFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4 font-[family-name:var(--font-inter)]">
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-8 text-center shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] ring-1 ring-[#E5E7EB]">
        <h1 className="mb-2 text-[20px] font-bold text-[#0F172A]">Open this link on your phone</h1>
        <p className="text-[14px] leading-6 text-[#475569]">
          This password reset link only works in the Healing Minds Matter app, on the phone where you asked for it.
          Open the email on that phone. If the link has expired, request a new one from the app&apos;s
          &ldquo;Forgot password?&rdquo; screen.
        </p>
      </div>
    </main>
  )
}
