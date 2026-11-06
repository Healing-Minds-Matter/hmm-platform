import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ResourceFilters } from './resource-filters'
import { ResourceTypeTabs } from './resource-type-tabs'
import { ResourceRow, type ResourceRowData } from './resource-row'

export const metadata = { title: 'Resources — HMM Super Admin' }

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; type?: string }>
}) {
  const { q, category, sort, type } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('resources')
    .select('id, title, description, type, category, publication_date, content_url, content_text, status')
    // Sheet row 16: by when the resource was added (newest first unless
    // "Oldest First" is chosen); id breaks ties.
    .order('created_at', { ascending: sort === 'oldest' })
    .order('id')

  if (q) query = query.ilike('title', `%${q}%`)
  if (category) query = query.eq('category', category)
  if (type) query = query.eq('type', type)

  const [{ data: resources }, { data: allForStats }] = await Promise.all([
    query,
    supabase.from('resources').select('type, category'),
  ])

  const resourceList = resources ?? []
  const withLinks: ResourceRowData[] = await Promise.all(
    resourceList.map(async (r) => {
      let link: string | null = null
      if (r.content_url) {
        if (isExternalUrl(r.content_url)) {
          link = r.content_url
        } else {
          const { data } = await supabase.storage.from('resources').createSignedUrl(r.content_url, 3600)
          link = data?.signedUrl ?? null
        }
      }
      return { id: r.id, title: r.title, description: r.description, type: r.type, category: r.category, publication_date: r.publication_date, content_url: r.content_url, status: r.status, link }
    })
  )

  // ── Real stats, always computed from the full dataset (independent of the
  // current filters) — drives the type-tabs' counts and the category select's
  // options, same "unfiltered baseline" pattern the old stat tiles used.
  const all = allForStats ?? []
  const typeCounts: Record<string, number> = {}
  for (const r of all) typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1

  const categories = Array.from(
    new Set(all.map(r => r.category?.trim()).filter((c): c is string => !!c))
  ).sort()

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Learning Resources</h1>
          <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
            Manage and share training guides, articles, and clinical resources across the platform for Champions and
            Gatekeepers.
          </p>
        </div>
        <Link
          href="/super-admin/resources/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-6 py-2.5 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Add Resource
        </Link>
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <ResourceFilters q={q} category={category} sort={sort} type={type} categories={categories} />
        <div className="border-t border-[#F1F5F9] pt-2">
          <ResourceTypeTabs active={type} counts={typeCounts} total={all.length} q={q} category={category} sort={sort} />
        </div>
      </div>

      {withLinks.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">
            {q || category || type ? 'No resources match your filters.' : 'No resources yet.'}
          </p>
          {!q && !category && !type && (
            <Link href="/super-admin/resources/new" className="mt-2 inline-block text-sm font-bold text-[#003495]">
              Add your first resource →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {withLinks.map(r => <ResourceRow key={r.id} resource={r} />)}
        </div>
      )}
    </div>
  )
}
