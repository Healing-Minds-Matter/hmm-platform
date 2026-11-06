import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { ChangeEmailModal } from './change-email-modal'

export default async function InterceptedChangeEmailPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect(await loginPath())

  return <ChangeEmailModal currentEmail={user.email} pendingEmail={user.new_email ?? null} />
}
