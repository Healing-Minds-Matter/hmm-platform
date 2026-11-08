// Server-side loader for the managed resource categories (sheet row 26).
import { createClient } from '@/lib/supabase/server'
import type { ResourceCategory } from '@/lib/resource-categories'

export async function loadResourceCategories(): Promise<ResourceCategory[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('resource_categories')
    .select('id, name, is_active')
    .order('display_order')
    .order('name')
  return data ?? []
}
