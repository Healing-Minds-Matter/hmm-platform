import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadResourceCategories } from '@/lib/resource-categories.server'
import { EditResourceForm } from '../../resource-form'

export const metadata = { title: 'Edit Resource — HMM Super Admin' }

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: resource } = await supabase
    .from('resources')
    .select('id, title, description, type, category, category_id, publication_date, content_url, content_text, status')
    .eq('id', id)
    .single()

  if (!resource) notFound()

  return (
    <div className="flex justify-center p-8">
      <EditResourceForm resource={resource} categories={await loadResourceCategories()} />
    </div>
  )
}
