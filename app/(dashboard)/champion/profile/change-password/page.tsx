import { ChangePasswordForm } from '@/app/(dashboard)/super-admin/profile/change-password-form'

export const metadata = { title: 'Change Password — HMM Champion' }

export default function ChampionChangePasswordPage() {
  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <ChangePasswordForm profilePath="/champion/profile" />
    </div>
  )
}
