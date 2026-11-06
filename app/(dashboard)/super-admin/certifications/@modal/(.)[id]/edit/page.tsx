import { RouteModal } from '@/components/certifications/route-modal'
import { loadTypeForForm } from '../../../load-form-data'
import { TypeForm } from '../../../type-form'

export default async function Modal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, issued } = await loadTypeForForm(id)
  return <RouteModal><TypeForm type={type} issued={issued} inModal /></RouteModal>
}
