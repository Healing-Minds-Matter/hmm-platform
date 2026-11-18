import Link from 'next/link'
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form'
import { Result } from '@/app/auth/confirm-account-email/confirm-account-email-form'
import { setUpAccountAction } from '@/actions/account-setup'
import { peekAccountSetupInvite } from '@/lib/account-setup.server'

export const metadata = { title: 'Set Your Password — HMM Platform' }

// Review Finding 2: opened from the "Set your Healing Minds Matter password"
// email. Opening it changes nothing — only submitting a password does, so an
// email security scanner that opens links automatically can't use it up.
export default async function SetUpAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string; for?: string }>
}) {
  const { token, status, for: target } = await searchParams

  let content: React.ReactNode
  if (status === 'done') {
    const loginPath = target === 'champion' ? '/champion/login' : target === 'super_admin' ? '/login' : null
    content = (
      <div className="space-y-4">
        <Result
          ok
          title="Your password is set"
          body={loginPath
            ? 'You can now sign in with your email address and new password.'
            : 'Open the Healing Minds Matter app and sign in with your email address and new password.'}
        />
        {loginPath && (
          <p className="text-center text-sm">
            <Link href={loginPath} className="font-semibold text-[#1B2B4A] underline">Go to sign in</Link>
          </p>
        )}
      </div>
    )
  } else {
    const invite = typeof token === 'string' && status !== 'invalid' ? await peekAccountSetupInvite(token) : null
    content = invite
      ? (
        <div className="w-full max-w-[480px]">
          <ResetPasswordForm
            email={invite.email}
            action={setUpAccountAction}
            token={token}
            heading="Set your password"
            intro="Choose a strong password for your Healing Minds Matter account."
            accountLabel="Setting a password for"
            submitLabel="Set password"
          />
        </div>
      )
      : (
        <Result
          ok={false}
          title="Link invalid or expired"
          body="This link is invalid, has expired, has been replaced by a newer one, or has already been used. To get a new link, use “Forgot password?” on the sign-in screen, or ask your Club Champion or administrator."
        />
      )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4 font-[family-name:var(--font-inter)]">
      {content}
    </main>
  )
}
