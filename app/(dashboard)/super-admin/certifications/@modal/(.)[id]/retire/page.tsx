import { RouteModal } from '@/components/certifications/route-modal'
import { todayDateString } from '@/lib/org-date'
import { loadTypeForForm } from '../../../load-form-data'
import { RetireForm } from '../../../retire-form'

export default async function Modal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, impact } = await loadTypeForForm(id)
  return <RouteModal><RetireForm type={type} impact={impact} today={todayDateString()} inModal /></RouteModal>
}
