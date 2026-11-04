'use client'

// Filter a people list by certification (or No certifications) and status
// (Story 10.12 Sc01). Keeps the list's other filters; goes back to page 1.
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LIST_STATUSES } from '@/lib/cert-summary'

const SELECT = 'rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-4 pr-8 text-[13px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40'

export function CertListFilters({ types }: { types: { id: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    if (key === 'cert' && value === 'none') next.delete('cstatus')
    router.push(`${pathname}?${next.toString()}`)
  }
  const cert = params.get('cert') ?? ''
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-6 py-3 font-[family-name:var(--font-inter)]">
      <span className="text-[12px] font-semibold text-[#475569]">Certifications</span>
      <select aria-label="Certification" value={cert} onChange={e => set('cert', e.target.value)} className={SELECT}>
        <option value="">All certifications</option>
        {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="none">No certifications</option>
      </select>
      <select aria-label="Certification status" value={params.get('cstatus') ?? ''} disabled={cert === 'none'} onChange={e => set('cstatus', e.target.value)} className={`${SELECT} disabled:opacity-50`}>
        <option value="">Any status</option>
        {LIST_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  )
}
