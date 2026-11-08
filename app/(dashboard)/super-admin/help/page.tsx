import { HelpCentre } from '@/components/help/help-centre'
import { SUPER_ADMIN_MANUAL } from '@/lib/help/manual-super-admin'
import { supportEmail } from '@/lib/help/support'

export const metadata = { title: 'Help — HMM Super Admin' }

// Sheet row 55: the Super Admin user manual.
export default function SuperAdminHelpPage() {
  return <HelpCentre manual={SUPER_ADMIN_MANUAL} supportEmail={supportEmail()} />
}
