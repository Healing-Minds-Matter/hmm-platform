import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CategoryCreateForm, CategoryRow } from './category-controls'

export const metadata = { title: 'Resource Categories — HMM Super Admin' }

// Resources > Categories (sheet row 26).
export default async function ResourceCategoriesPage() {
  const supabase = await createClient()
  const [{ data: categories }, { data: used }, { data: canManage }] = await Promise.all([
    supabase.from('resource_categories').select('id, name, is_active').order('display_order').order('name'),
    supabase.from('resources').select('category_id').not('category_id', 'is', null),
    supabase.rpc('cert_can', { p_permission: 'manage_resource_categories' }),
  ])
  const counts = new Map<string, number>()
  for (const r of used ?? []) counts.set(r.category_id as string, (counts.get(r.category_id as string) ?? 0) + 1)
  const list = categories ?? []

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex flex-col gap-1">
        <Link href="/super-admin/resources" className="text-[13px] font-semibold text-[#003495] hover:underline">← Learning Resources</Link>
        <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Resource Categories</h1>
        <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
          The categories offered when adding a resource. A category that is used by resources can&apos;t be deleted — deactivate it
          instead: it stays on those resources but is no longer offered for new ones.
        </p>
      </div>

      {canManage === true && <CategoryCreateForm />}

      <div className="overflow-hidden rounded-xl bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <table className="w-full text-left">
          <caption className="sr-only">Resource categories</caption>
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F9F9F9] text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Resources</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px] text-[#64748B]">No categories yet.</td></tr>
            )}
            {list.map(c => (
              <CategoryRow key={c.id} category={c} resourceCount={counts.get(c.id) ?? 0} canManage={canManage === true} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
