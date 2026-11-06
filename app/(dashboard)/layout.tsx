import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardClientLayout } from '@/components/dashboard-client-layout'
import { loadBell } from '@/lib/notifications.server'
import { signedInAtFromAccessToken } from '@/lib/session-policy'
import { loginPath } from '@/lib/login-redirect.server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(await loginPath())

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_active, deactivation_reason')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active) {
    await supabase.auth.signOut()
    const reason = profile?.deactivation_reason === 'club_deactivated'
      ? 'club_inactive'
      : 'account_inactive'
    redirect(`${await loginPath(profile?.role)}?error=${reason}`)
  }

  const bell = await loadBell(supabase, { id: user.id, role: profile.role })
  // For the 12-hour maximum session length (lib/session-policy.ts).
  const { data: { session } } = await supabase.auth.getSession()
  const signedInAt = signedInAtFromAccessToken(session?.access_token)

  return (
    <DashboardClientLayout profile={profile} bell={bell} signedInAt={signedInAt}>
      {children}
    </DashboardClientLayout>
  )
}
