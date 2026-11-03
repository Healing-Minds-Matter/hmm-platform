import { todayDateString } from '@/lib/org-date'
import { TypeForm } from '../type-form'

export const metadata = { title: 'New certification type — HMM Super Admin' }

export default function NewTypePage() {
  return <div className="flex justify-center p-8"><TypeForm today={todayDateString()} /></div>
}
