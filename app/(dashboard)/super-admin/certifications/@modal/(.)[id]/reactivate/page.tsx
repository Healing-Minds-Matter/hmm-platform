import { redirect } from 'next/navigation'
import { RouteModal } from '@/components/certifications/route-modal'
import { todayDateString } from '@/lib/org-date'
import { loadTypeForForm } from '../../../load-form-data'
import { ReactivateForm } from '../../../reactivate-form'

export default async function Modal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, impact } = await loadTypeForForm(id)
  if (type.status !== 'retired') redirect(`/super-admin/certifications/${id}`)
  return <RouteModal><ReactivateForm type={type} stopped={impact.stopped} today={todayDateString()} inModal /></RouteModal>
}
