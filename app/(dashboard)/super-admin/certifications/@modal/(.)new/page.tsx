import { RouteModal } from '@/components/certifications/route-modal'
import { todayDateString } from '@/lib/org-date'
import { TypeForm } from '../../type-form'

export default function NewTypeModal() {
  return <RouteModal><TypeForm today={todayDateString()} inModal /></RouteModal>
}
