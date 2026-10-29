'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export function ChampionGatekeeperFilters({
  q,
  status,
}: {
  q?: string
  status?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams()
    if (key !== 'q' && q) params.set('q', q)
    if (key !== 'status' && status) params.set('status', status)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, q, status])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-6 py-3 font-[family-name:var(--font-inter)]">
      <div className="relative min-w-[240px] max-w-[420px] flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/search-filter.svg"
          alt=""
          className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
        />
        <input
          type="search"
          placeholder="Search by name, email, phone, or ID..."
          defaultValue={q}
          onChange={e => update('q', e.target.value)}
          className="w-full rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-9 pr-4 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
        />
      </div>

      <select
        defaultValue={status ?? ''}
        onChange={e => update('status', e.target.value)}
        className="flex-shrink-0 rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-4 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40"
      >
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="expiring_soon">Expiring Soon</option>
        <option value="expired">Expired</option>
        <option value="not_certified">Not Certified</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
  )
}
