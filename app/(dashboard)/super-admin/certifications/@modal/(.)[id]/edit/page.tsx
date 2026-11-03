import { RouteModal } from '@/components/certifications/route-modal'
import { todayDateString } from '@/lib/org-date'
import { loadTypeForForm } from '../../../load-form-data'
import { TypeForm } from '../../../type-form'

export default async function Modal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, codeLocked } = await loadTypeForForm(id)
  return <RouteModal><TypeForm type={type} codeLocked={codeLocked} today={todayDateString()} inModal /></RouteModal>
}
