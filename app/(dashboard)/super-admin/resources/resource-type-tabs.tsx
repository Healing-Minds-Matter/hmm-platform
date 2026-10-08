import Link from 'next/link'

const RESOURCE_TYPE_LABEL_PLURAL: Record<string, string> = {
  video: 'Videos',
  article: 'Articles',
  document: 'Documents',
}

function buildHref(basePath: string, params: { q?: string; category?: string; sort?: string; type?: string }) {
  const usp = new URLSearchParams()
  if (params.q) usp.set('q', params.q)
  if (params.category) usp.set('category', params.category)
  if (params.sort) usp.set('sort', params.sort)
  if (params.type) usp.set('type', params.type)
  const qs = usp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// Segmented type filter with real counts computed from the full dataset
// (independent of the current filters) — matches Figma's "All (48) / Videos
// (14) / ..." pill row, but the counts are the real ones for this data, not
// the design's placeholder numbers.
export function ResourceTypeTabs({
  active,
  counts,
  total,
  q,
  category,
  sort,
  basePath = '/super-admin/resources',
}: {
  active?: string
  counts: Record<string, number>
  total: number
  q?: string
  category?: string
  sort?: string
  basePath?: string
}) {
  const tabs = [
    { value: undefined, label: `All (${total})` },
    ...Object.keys(RESOURCE_TYPE_LABEL_PLURAL).map(type => ({
      value: type,
      label: `${RESOURCE_TYPE_LABEL_PLURAL[type]} (${counts[type] ?? 0})`,
    })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
      {tabs.map(tab => {
        const isActive = active === tab.value
        return (
          <Link
            key={tab.label}
            href={buildHref(basePath, { q, category, sort, type: tab.value })}
            className={`flex items-center justify-center whitespace-nowrap rounded-[5px] px-4 py-1.5 text-[12px] font-semibold tracking-[0.24px] transition-colors ${
              isActive ? 'bg-[#022C51] text-white' : 'text-[#475569] hover:bg-white/60'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
