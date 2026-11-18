import { Suspense } from 'react'
import { MfaForm } from './mfa-form'

export const metadata = { title: 'Two-step verification — HMM Platform' }

// Review Finding 8: Super Admins verify with a code from an authenticator app
// after their password (first time: set the app up). The middleware sends a
// Super Admin here until their session is verified, and sends everyone else
// away.
export default function MfaPage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  )
}
