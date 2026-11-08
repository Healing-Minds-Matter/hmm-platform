import { notFound } from 'next/navigation'
import { ResourceView } from '../resource-view'

export const metadata = { title: 'Resource — HMM Super Admin' }

export default async function ViewResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await ResourceView({ id, basePath: '/super-admin/resources', canManage: true, publishedOnly: false })
  if (!view) notFound()
  return view
}
