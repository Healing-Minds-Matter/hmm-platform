import { loadTypeForForm } from '../../load-form-data'
import { TypeForm } from '../../type-form'

export const metadata = { title: 'Edit certification type — HMM Super Admin' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type, issued } = await loadTypeForForm(id)
  return <div className="flex justify-center p-8"><TypeForm type={type} issued={issued} /></div>
}
