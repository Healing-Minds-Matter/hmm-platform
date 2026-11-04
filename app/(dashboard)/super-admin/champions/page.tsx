import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChampionFilters } from './champion-filters'
import { ExportChampionsButton, type ExportRow } from './export-champions-button'
import { CertChips } from '@/components/certifications/cert-chips'
import { CertListFilters } from '@/components/certifications/cert-list-filters'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { matchesCertFilter } from '@/lib/cert-summary'
import { todayDateString } from '@/lib/org-date'

export const metadata = { title: 'Champions — HMM Super Admin' }

const PAGE_SIZE = 10

function buildHref(params: { q?: string; club?: string; status?: string; cert?: string; cstatus?: string; page?: number }) {
  const usp = new URLSearchParams()
  if (params.q) usp.set('q', params.q)
  if (params.club) usp.set('club', params.club)
  if (params.status) usp.set('status', params.status)
  if (params.cert) usp.set('cert', params.cert)
  if (params.cstatus) usp.set('cstatus', params.cstatus)
  if (params.page && params.page > 1) usp.set('page', String(params.page))
  const qs = usp.toString()
  return qs ? `/super-admin/champions?${qs}` : '/super-admin/champions'
}

// "Marcus Chen" + "MSW" -> "Marcus Chen, MSW" (matches the genuine Figma
// example rows' name+title combination — no separate title line).
function displayName(fullName: string, title: string | null) {
  return title ? `${fullName}, ${title}` : fullName
}

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; club?: string; status?: string; cert?: string; cstatus?: string; page?: string }>
}) {
  const { q, club: clubFilter, status, cert, cstatus, page: pageParam } = await searchParams
  const requestedPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const supabase = await createClient()

  // Certification filters (Story 10.12 Sc01) narrow the list to matching ids before paging.
  const summary = await loadCertSummary(supabase)
  const typeMap = new Map(summary.types.map(t => [t.id, t]))
  let certIds: string[] | null = null
  if (cert || cstatus) {
    const { data: all } = await supabase.from('profiles').select('id').eq('role', 'champion')
    certIds = (all ?? []).map(r => r.id).filter(id => matchesCertFilter(summary.byHolder.get(id) ?? [], cert, cstatus))
  }
  const NO_MATCH = '00000000-0000-0000-0000-000000000000'

  // Count matching rows first so an out-of-range page can be clamped before
  // the real data fetch (same convention as the Clubs list).
  let countQuery = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'champion')
  if (q)          countQuery = countQuery.ilike('full_name', `%${q}%`)
  if (clubFilter) countQuery = countQuery.eq('club_id', clubFilter)
  if (status === 'active')   countQuery = countQuery.eq('is_active', true)
  if (status === 'inactive') countQuery = countQuery.eq('is_active', false)
  if (certIds) countQuery = countQuery.in('id', certIds.length ? certIds : [NO_MATCH])
  const { count } = await countQuery

  const totalChampions = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalChampions / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, phone, title, is_active, club_id, clubs!profiles_club_id_fkey(id, name)')
    .eq('role', 'champion')
    .order('full_name')

  if (q)          query = query.ilike('full_name', `%${q}%`)
  if (clubFilter) query = query.eq('club_id', clubFilter)
  if (status === 'active')   query = query.eq('is_active', true)
  if (status === 'inactive') query = query.eq('is_active', false)
  if (certIds) query = query.in('id', certIds.length ? certIds : [NO_MATCH])

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: champions } = await query
  const championList = champions ?? []
  const clubIds = [...new Set(championList.map(c => c.club_id).filter((id): id is string => !!id))]

  const { data: gkRows } = clubIds.length
    ? await supabase
        .from('profiles')
        .select('club_id')
        .eq('role', 'gatekeeper')
        .eq('is_active', true)
        .in('club_id', clubIds)
    : { data: [] }

  const gatekeeperCountByClub: Record<string, number> = {}
  for (const row of gkRows ?? []) {
    if (row.club_id) gatekeeperCountByClub[row.club_id] = (gatekeeperCountByClub[row.club_id] ?? 0) + 1
  }

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .order('name')

  const showingFrom = totalChampions === 0 ? 0 : from + 1
  const showingTo = Math.min(from + championList.length, totalChampions)

  // Windowed page numbers (max 5) — never render fake pages beyond totalPages.
  const windowSize = 5
  let startPage = Math.max(1, page - Math.floor(windowSize / 2))
  let endPage = Math.min(totalPages, startPage + windowSize - 1)
  startPage = Math.max(1, endPage - windowSize + 1)
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  // Export covers the rows currently displayed on this page (client-side CSV,
  // no extra query) — same computed values the table itself renders.
  const exportRows: ExportRow[] = championList.map(ch => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const club = ch.clubs as any
    return {
      full_name: ch.full_name,
      email: ch.email,
      phone: ch.phone,
      title: ch.title,
      club_name: club?.name ?? '—',
      gatekeepers: ch.club_id ? (gatekeeperCountByClub[ch.club_id] ?? 0) : 0,
      is_active: ch.is_active,
    }
  })

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Champion Management</h1>
          <p className="mt-1 text-sm text-[#475569]">
            Manage coordinators, club assignments, and certification statuses across all community clubs.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <ExportChampionsButton rows={exportRows} />
          <Link
            href="/super-admin/champions/new"
            className="flex items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
            Add Champion
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E2E8F0]/60 bg-[#EFF4FF] px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/info-banner.svg" alt="" width={16.667} height={16.667} className="flex-shrink-0" />
          <p className="text-[13px] leading-[18px] text-[#475569]">
            Each champion is assigned to a single club to ensure dedicated student support and safety.
            Inactive accounts can be reactivated at any time.
          </p>
        </div>
      </div>

      <ChampionFilters q={q} clubFilter={clubFilter} status={status} clubs={clubs ?? []} />
      <CertListFilters types={summary.types} />

      <div className="overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white">
        {championList.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">
            {q || clubFilter || status || cert || cstatus ? 'No champions match your filters.' : 'No champions yet.'}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
                  <th className="min-w-[240px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Champion
                  </th>
                  <th className="min-w-[180px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Assigned Club
                  </th>
                  <th className="min-w-[200px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Certifications
                  </th>
                  <th className="w-[130px] px-[16px] text-center text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Gatekeepers
                  </th>
                  <th className="w-[120px] px-[16px] text-center text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Status
                  </th>
                  <th className="w-[110px] px-[16px]" />
                </tr>
              </thead>
              <tbody>
                {championList.map(ch => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const club = ch.clubs as any
                  const clubName = club?.name ?? '—'
                  const gkCount = ch.club_id ? (gatekeeperCountByClub[ch.club_id] ?? 0) : 0

                  return (
                    <tr
                      key={ch.id}
                      className="h-[65px] border-t border-[rgba(226,232,240,0.5)] hover:bg-gray-50 transition-colors"
                    >
                      {/* Champion */}
                      <td className="px-[16px] py-3">
                        <div className="text-[13px] font-semibold text-[#0F172A]">
                          {displayName(ch.full_name, ch.title)}
                        </div>
                        <div className="text-[13px] text-[#64748B]">{ch.email}</div>
                      </td>

                      {/* Assigned Club */}
                      <td className="px-[16px] py-3 text-[13px] font-medium text-[#0F172A]">
                        {clubName}
                      </td>

                      {/* Certifications (Story 10.12 Sc01). Only Super Admins can renew a Champion's certificate. */}
                      <td className="px-[16px] py-3 text-[13px]">
                        <CertChips certs={summary.byHolder.get(ch.id) ?? []} types={typeMap} today={todayDateString()} renewBase={`/super-admin/champions/${ch.id}`} />
                      </td>

                      {/* Gatekeepers */}
                      <td className="px-[16px] py-3 text-center text-[13px] font-semibold text-[#0F172A]">
                        {gkCount}
                      </td>

                      {/* Status */}
                      <td className="px-[16px] py-3 text-center">
                        {ch.is_active ? (
                          <span className="inline-flex items-center gap-[6px] rounded-full bg-[#E6FFE7] px-[10px] py-[2px] text-[11px] font-medium tracking-[0.44px] text-[#0D8275]">
                            <span className="h-[6px] w-[6px] rounded-full bg-[#0D8275]" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-[6px] rounded-full bg-[#F1F5F9] px-[10px] py-[2px] text-[11px] font-medium tracking-[0.44px] text-[#64748B]">
                            <span className="h-[6px] w-[6px] rounded-full bg-[#94A3B8]" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-[16px] py-3">
                        {ch.is_active ? (
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/super-admin/champions/${ch.id}`}
                              aria-label="View"
                              className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                            </Link>
                            <Link
                              href={`/super-admin/champions/${ch.id}/edit`}
                              aria-label="Edit"
                              className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/pencil.svg" alt="" width={13.5} height={13.5} />
                            </Link>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            {/* Reactivating a champion requires confirming (or reassigning)
                                their club — their original club may now be inactive — so
                                this navigates to the existing dedicated confirmation page
                                (Story 8.3) rather than a one-click submit. */}
                            <Link
                              href={`/super-admin/champions/${ch.id}/reactivate`}
                              className="flex items-center gap-1 rounded-[8px] bg-[#F1F5F9] px-[10px] py-[4px] text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:bg-slate-200 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/reactivate.svg" alt="" width={10.667} height={12.3} />
                              Reactivate
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[rgba(226,232,240,0.8)] bg-white py-[16px] pl-[25px] pr-[16px]">
              <p className="text-[10px] text-[#8492A6]">
                Showing <span className="font-bold text-[#5D626E]">{showingFrom} to {showingTo}</span> of{' '}
                <span className="font-bold text-[#5D626E]">{totalChampions}</span> Champions
              </p>

              <div className="flex items-center gap-[6px]">
                {page <= 1 ? (
                  <span className="flex h-[22px] cursor-default items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] opacity-50">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={buildHref({ q, club: clubFilter, status, cert, cstatus, page: page - 1 })}
                    className="flex h-[22px] items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-slate-200 transition-colors"
                  >
                    Previous
                  </Link>
                )}

                {pageNumbers.map(n => (
                  n === page ? (
                    <span
                      key={n}
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] bg-[#012C51] text-[10px] font-bold tracking-[0.24px] text-white"
                    >
                      {n}
                    </span>
                  ) : (
                    <Link
                      key={n}
                      href={buildHref({ q, club: clubFilter, status, cert, cstatus, page: n })}
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-gray-100 transition-colors"
                    >
                      {n}
                    </Link>
                  )
                ))}

                {page >= totalPages ? (
                  <span className="flex h-[22px] cursor-default items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] opacity-50">
                    Next
                  </span>
                ) : (
                  <Link
                    href={buildHref({ q, club: clubFilter, status, cert, cstatus, page: page + 1 })}
                    className="flex h-[22px] items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-slate-200 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
