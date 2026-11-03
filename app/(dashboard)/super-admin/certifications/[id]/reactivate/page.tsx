import { redirect } from 'next/navigation'
import { todayDateString } from '@/lib/org-date'
import { loadTypeForForm } from '../../load-form-data'
import { ReactivateForm } from '../../reactivate-form'

export const metadata = { title: 'Reactivate certification type — HMM Super Admin' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, impact } = await loadTypeForForm(id)
  if (type.status !== 'retired') redirect(`/super-admin/certifications/${id}`)
  return <div className="flex justify-center p-8"><ReactivateForm type={type} stopped={impact.stopped} today={todayDateString()} /></div>
}
