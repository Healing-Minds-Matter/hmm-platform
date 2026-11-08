import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { ChangeEmailForm } from '../change-email-form'

export const metadata = { title: 'Change Sign-in Email — HMM Super Admin' }

export default async function ChangeEmailFallbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect(await loginPath())

  return (
    <div className="flex justify-center p-8">
      <ChangeEmailForm currentEmail={user.email} pendingEmail={user.new_email ?? null} />
    </div>
  )
}
