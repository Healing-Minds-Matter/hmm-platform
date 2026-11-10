import { ConfirmAccountEmailForm } from './confirm-account-email-form'

export const metadata = { title: 'Confirm Email Address — HMM Platform' }

// Opened from the "Confirm your new sign-in email" message sent when a Super
// Admin or Champion changes someone's email (Security Finding 3). Opening it
// changes nothing — only the Confirm button does, so an email security
// scanner that opens links automatically can't complete a change.
export default async function ConfirmAccountEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4 font-[family-name:var(--font-inter)]">
      <ConfirmAccountEmailForm token={typeof token === 'string' && token ? token : null} />
    </main>
  )
}
