'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export function ClubFilters({ q, status }: { q?: string; status?: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams()
    if (key !== 'q' && q)      params.set('q', q)
    if (key !== 'status' && status) params.set('status', status)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, q, status])

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-6 py-3 max-lg:flex-wrap max-sm:px-4 font-[family-name:var(--font-inter)]">
      <div className="relative w-full max-w-[516px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/search-filter.svg"
          alt=""
          className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
        />
        <input
          type="search"
          placeholder="Search clubs by name, code, or location…"
          defaultValue={q}
          onChange={e => update('q', e.target.value)}
          className="w-full rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-9 pr-4 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <select
          defaultValue={status ?? ''}
          onChange={e => update('status', e.target.value)}
          className="rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-4 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="button"
          onClick={() => router.refresh()}
          aria-label="Refresh club list"
          title="Refresh"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-gray-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/refresh.svg" alt="" width={13.333} height={15.375} />
        </button>
      </div>
    </div>
  )
}
