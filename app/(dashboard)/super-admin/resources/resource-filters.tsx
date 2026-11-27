'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export function ResourceFilters({
  q,
  category,
  sort,
  type,
  categories,
}: {
  q?: string
  category?: string
  sort?: string
  type?: string
  categories: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams()
    if (key !== 'q' && q)               params.set('q', q)
    if (key !== 'category' && category) params.set('category', category)
    if (key !== 'sort' && sort)         params.set('sort', sort)
    if (type)                           params.set('type', type)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, q, category, sort, type])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative min-w-[240px] flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/search-filter.svg"
          alt=""
          className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
        />
        <input
          type="search"
          placeholder="Search resources by title, topic, or keyword..."
          defaultValue={q}
          onChange={e => update('q', e.target.value)}
          className="w-full rounded-lg border border-transparent bg-[#F1F5F9] py-[11px] pl-10 pr-4 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
        <div className="relative max-sm:w-full">
          <select
            defaultValue={category ?? ''}
            onChange={e => update('category', e.target.value)}
            className="min-w-[170px] appearance-none max-sm:w-full max-sm:min-w-0 rounded-lg border border-transparent bg-[#F1F5F9] py-2.5 pl-3 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
        </div>

        <div className="relative max-sm:w-full">
          <select
            defaultValue={sort ?? 'newest'}
            onChange={e => update('sort', e.target.value)}
            className="min-w-[160px] appearance-none max-sm:w-full max-sm:min-w-0 rounded-lg border border-transparent bg-[#F1F5F9] py-2.5 pl-3 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/sort-arrows.svg" alt="" className="pointer-events-none absolute right-3 top-1/2 h-[9px] w-[13.5px] -translate-y-1/2" />
        </div>
      </div>
    </div>
  )
}
