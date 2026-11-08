import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadResourceCategories } from '@/lib/resource-categories.server'
import { EditResourceModal } from './edit-resource-modal'

export default async function InterceptedEditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: resource } = await supabase
    .from('resources')
    .select('id, title, description, type, category, category_id, publication_date, content_url, content_text, status')
    .eq('id', id)
    .single()

  if (!resource) notFound()

  return <EditResourceModal resource={resource} categories={await loadResourceCategories()} />
}
