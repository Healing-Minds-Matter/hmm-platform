import { notFound } from 'next/navigation'
import { ResourceView } from '@/app/(dashboard)/super-admin/resources/resource-view'

export const metadata = { title: 'Resource — HMM Champion' }

// Read-only for Champions; only published resources (RLS + the filter).
export default async function ChampionViewResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await ResourceView({ id, basePath: '/champion/resources', canManage: false, publishedOnly: true })
  if (!view) notFound()
  return view
}
