import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from '@/app/(dashboard)/super-admin/profile/change-password-form'

export const metadata = { title: 'Set Your Password — HMM Platform' }

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, must_change_password')
    .eq('id', user.id)
    .single()

  const destination = profile?.role === 'super_admin' ? '/super-admin' : '/champion'

  // Already set (or never needed to be) — nothing to force here, and
  // middleware won't route anyone here in that state anyway except via a
  // stale bookmark/back-button, so just send them on.
  if (!profile?.must_change_password) redirect(destination)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#FFF8EE] p-4">
      <ChangePasswordForm mode="forced" redirectTo={destination} />
    </div>
  )
}
