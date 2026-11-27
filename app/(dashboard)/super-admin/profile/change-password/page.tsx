import { ChangePasswordForm } from '../change-password-form'

export const metadata = { title: 'Change Password — HMM Super Admin' }

export default function ChangePasswordFallbackPage() {
  return (
    <div className="flex justify-center p-8 max-sm:p-4">
      <ChangePasswordForm />
    </div>
  )
}
