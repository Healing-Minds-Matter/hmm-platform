import { loadResourceCategories } from '@/lib/resource-categories.server'
import { NewResourceModal } from './new-resource-modal'

export default async function InterceptedNewResourcePage() {
  return <NewResourceModal categories={await loadResourceCategories()} />
}
