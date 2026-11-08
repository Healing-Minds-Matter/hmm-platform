import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'
import { createClient } from '@/lib/supabase/server'
import { ResourceFilters } from '@/app/(dashboard)/super-admin/resources/resource-filters'
import { ResourceTypeTabs } from '@/app/(dashboard)/super-admin/resources/resource-type-tabs'
import { ResourceRow, type ResourceRowData } from '@/app/(dashboard)/super-admin/resources/resource-row'

export const metadata = { title: 'Resources — HMM Champion' }

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

export default async function ChampionResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; type?: string }>
}) {
  const { q, category, sort, type } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  // RLS ("resources: champion read published") already scopes this to
  // publication_date <= today, platform-wide (not club-scoped — matches
  // "Champions can browse and access all resources published by the Super
  // Admin"). The explicit status filter below is an extra safety layer:
  // that RLS policy checks publication_date only, not status, so a
  // still-in-progress draft with a past publication_date could otherwise
  // leak through.
  let query = supabase
    .from('resources')
    .select('id, title, description, type, category, publication_date, content_url, content_text, status')
    .eq('status', 'published')
    .order('publication_date', { ascending: sort === 'oldest' })

  if (q) query = query.ilike('title', `%${q}%`)
  if (category) query = query.eq('category', category)
  if (type) query = query.eq('type', type)

  const [{ data: resources }, { data: allForStats }] = await Promise.all([
    query,
    supabase.from('resources').select('type, category').eq('status', 'published'),
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

  const all = allForStats ?? []
  const typeCounts: Record<string, number> = {}
  for (const r of all) typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1

  const categories = Array.from(
    new Set(all.map(r => r.category?.trim()).filter((c): c is string => !!c))
  ).sort()

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Learning Resources</h1>
        <p className="max-w-[768px] text-[14px] leading-5 text-[#475569]">
          Training guides, articles, and clinical resources published by Super Admin.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <ResourceFilters q={q} category={category} sort={sort} type={type} categories={categories} />
        <div className="border-t border-[#F1F5F9] pt-2">
          <ResourceTypeTabs
            active={type}
            counts={typeCounts}
            total={all.length}
            q={q}
            category={category}
            sort={sort}
            basePath="/champion/resources"
          />
        </div>
      </div>

      {withLinks.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-[#64748B]">
            {q || category || type ? 'No resources match your filters.' : 'No resources available yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {withLinks.map(r => (
            <ResourceRow key={r.id} resource={r} basePath="/champion/resources" canManage={false} />
          ))}
        </div>
      )}
    </div>
  )
}
