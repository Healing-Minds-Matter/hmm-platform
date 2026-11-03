import { todayDateString } from '@/lib/org-date'
import { loadTypeForForm } from '../../load-form-data'
import { RetireForm } from '../../retire-form'

export const metadata = { title: 'Retire certification type — HMM Super Admin' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, impact } = await loadTypeForForm(id)
  return <div className="flex justify-center p-8"><RetireForm type={type} impact={impact} today={todayDateString()} /></div>
}
