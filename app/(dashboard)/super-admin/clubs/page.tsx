import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { certifiedFigures } from '@/lib/cert-summary'
import { reactivateClubFormAction } from '@/actions/clubs'
import { ClubFilters } from './club-filters'
import { ExportClubsButton, type ExportRow } from './export-clubs-button'

export const metadata = { title: 'Clubs — HMM Super Admin' }

const PAGE_SIZE = 10

// Deterministic avatar background color, hashed from the champion's id so it's
// stable across renders/reloads (no real "champion color" field exists).
const AVATAR_COLORS = [
  '#8B5BCE', '#34497B', '#7E5700', '#1E4BB8',
  '#7FAD60', '#1EB3B8', '#0D8275', '#D97706',
]

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// "Marcus Chen" -> "Marcus C."
function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function ChampionNames({ champions }: { champions: { id: string; full_name: string }[] }) {
  if (champions.length === 1) {
    return <span>{champions[0].full_name}</span>
  }
  if (champions.length === 2) {
    return (
      <>
        <span>{abbreviateName(champions[0].full_name)},</span>
        <br />
        <span>{abbreviateName(champions[1].full_name)}</span>
      </>
    )
  }
  return <span>{abbreviateName(champions[0].full_name)}, +{champions.length - 1} more</span>
}

function buildHref(params: { q?: string; status?: string; page?: number }) {
  const usp = new URLSearchParams()
  if (params.q) usp.set('q', params.q)
  if (params.status) usp.set('status', params.status)
  if (params.page && params.page > 1) usp.set('page', String(params.page))
  const qs = usp.toString()
  return qs ? `/super-admin/clubs?${qs}` : '/super-admin/clubs'
}

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const { q, status, page: pageParam } = await searchParams
  const requestedPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const supabase = await createClient()

  // Count matching rows first so an out-of-range page can be clamped before
  // the real data fetch (real club count is tiny today, but this keeps the
  // pagination correct as it grows).
  let countQuery = supabase.from('clubs').select('id', { count: 'exact', head: true })
  if (q) countQuery = countQuery.ilike('name', `%${q}%`)
  if (status === 'active') countQuery = countQuery.eq('is_active', true)
  if (status === 'inactive') countQuery = countQuery.eq('is_active', false)
  const { count } = await countQuery

  const totalClubs = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalClubs / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  let query = supabase
    .from('clubs')
    .select('id, club_code, name, location, is_active, created_at')
    // Sheet row 16: newest first, id breaks ties so paging is stable.
    .order('created_at', { ascending: false })
    .order('id')

  if (q) query = query.ilike('name', `%${q}%`)
  if (status === 'active')   query = query.eq('is_active', true)
  if (status === 'inactive') query = query.eq('is_active', false)

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: clubs } = await query
  const clubList = clubs ?? []
  const clubIds = clubList.map(c => c.id)

  const [{ data: champRows }, { data: gkRows }, { data: peopleRows }] = clubIds.length
    ? await Promise.all([
        supabase
          .from('profiles')
          .select('id, club_id, full_name')
          .eq('role', 'champion')
          .eq('is_active', true)
          .in('club_id', clubIds)
          .order('full_name'),
        supabase
          .from('profiles')
          .select('club_id')
          .eq('role', 'gatekeeper')
          .eq('is_active', true)
          .in('club_id', clubIds),
        supabase
          .from('profiles')
          .select('id, club_id')
          .in('role', ['champion', 'gatekeeper'])
          .eq('is_active', true)
          .in('club_id', clubIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const championsByClub: Record<string, { id: string; full_name: string }[]> = {}
  for (const row of champRows ?? []) {
    if (row.club_id) {
      championsByClub[row.club_id] ??= []
      championsByClub[row.club_id].push({ id: row.id, full_name: row.full_name })
    }
  }

  const gatekeeperCountByClub: Record<string, number> = {}
  for (const row of gkRows ?? []) {
    if (row.club_id) gatekeeperCountByClub[row.club_id] = (gatekeeperCountByClub[row.club_id] ?? 0) + 1
  }

  // Certification readiness: of each club's active Champions and Gatekeepers, how many hold
  // at least one current certificate, of any type, that is valid or expiring soon.
  const { byHolder } = await loadCertSummary(supabase)
  const peopleByClub: Record<string, string[]> = {}
  for (const row of peopleRows ?? []) {
    if (row.club_id) (peopleByClub[row.club_id] ??= []).push(row.id)
  }
  const readinessByClub: Record<string, { certified: number; total: number }> = Object.fromEntries(
    Object.entries(peopleByClub).map(([clubId, people]) => [clubId, certifiedFigures(byHolder, people)]),
  )

  const showingFrom = totalClubs === 0 ? 0 : from + 1
  const showingTo = Math.min(from + clubList.length, totalClubs)

  // Windowed page numbers (max 5) — never render fake pages beyond totalPages.
  const windowSize = 5
  let startPage = Math.max(1, page - Math.floor(windowSize / 2))
  const endPage = Math.min(totalPages, startPage + windowSize - 1)
  startPage = Math.max(1, endPage - windowSize + 1)
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  // Export covers the rows currently displayed on this page (client-side CSV,
  // no extra query) — same computed values the table itself renders.
  const exportRows: ExportRow[] = clubList.map(club => {
    const champions = championsByClub[club.id] ?? []
    const readiness = readinessByClub[club.id]
    const pct = readiness && readiness.total > 0 ? Math.round((readiness.certified / readiness.total) * 100) : null
    return {
      name: club.name,
      club_code: club.club_code,
      location: club.location,
      is_active: club.is_active,
      gatekeepers: gatekeeperCountByClub[club.id] ?? 0,
      champions: champions.map(c => c.full_name).join('; '),
      certified_pct: pct,
    }
  })

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Club Management</h1>
          <p className="mt-1 text-sm text-[#475569]">
            Manage regional clubs, champion assignments, and community health.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <ExportClubsButton rows={exportRows} />
          <Link
            href="/super-admin/clubs/new"
            className="flex items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
            Create New Club
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E2E8F0]/60 bg-[#EFF4FF] px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/info-banner.svg" alt="" width={16.667} height={16.667} className="flex-shrink-0" />
          <p className="text-[13px] leading-[18px] text-[#475569]">
            Deactivating a club temporarily pauses portal access for its assigned members until reactivated.
            Historical records remain preserved.
          </p>
        </div>
      </div>

      <ClubFilters q={q} status={status} />

      <div className="overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white">
        {clubList.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">
            {q || status ? 'No clubs match your filters.' : 'No clubs yet. Create one to get started.'}
          </div>
        ) : (
          <>
            <table className="w-full table-fixed">
              <thead>
                <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
                  <th className="w-[21.6%] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Club
                  </th>
                  <th className="w-[20.3%] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Assigned Champions
                  </th>
                  <th className="w-[12.8%] px-[16px] text-center text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Gatekeepers
                  </th>
                  <th className="w-[19.1%] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Certification Readiness
                  </th>
                  <th className="w-[12.1%] px-[16px] text-center text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Status
                  </th>
                  <th className="w-[14.1%] px-[16px]" />
                </tr>
              </thead>
              <tbody>
                {clubList.map(club => {
                  const champions = championsByClub[club.id] ?? []
                  const gkCount = gatekeeperCountByClub[club.id] ?? 0
                  const readiness = readinessByClub[club.id]
                  const pct = readiness && readiness.total > 0 ? Math.round((readiness.certified / readiness.total) * 100) : null
                  const readinessColor = pct !== null && pct >= 80 ? '#15803D' : '#B45309'

                  return (
                    <tr
                      key={club.id}
                      className="h-[65px] border-t border-[rgba(226,232,240,0.5)] hover:bg-gray-50 transition-colors"
                    >
                      {/* Club */}
                      <td className="px-[16px] py-3">
                        <div className="text-[13px] font-semibold text-[#0F172A]">{club.name}</div>
                        <div className="text-[12px] text-[#64748B]">
                          {club.club_code ?? '—'} • {club.location}
                        </div>
                      </td>

                      {/* Assigned Champions */}
                      <td className="px-[16px] py-3">
                        {champions.length === 0 ? (
                          club.is_active ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                              No active Champion
                            </span>
                          ) : (
                            <span className="text-[13px] text-[#94A3B8]">—</span>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center">
                              {champions.slice(0, 2).map((c, i) => (
                                <div
                                  key={c.id}
                                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-[0_0_0_2px_white] ${i > 0 ? '-ml-1.5' : ''}`}
                                  style={{ backgroundColor: avatarColor(c.id) }}
                                >
                                  {getInitials(c.full_name)}
                                </div>
                              ))}
                            </div>
                            <div className="text-[13px] leading-[18px] text-[#475569]">
                              <ChampionNames champions={champions} />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Gatekeepers */}
                      <td className="px-[16px] py-3 text-center text-[13px] font-semibold text-[#0F172A]">
                        {gkCount}
                      </td>

                      {/* Certification Readiness */}
                      <td className="px-[16px] py-3">
                        {!club.is_active ? (
                          <span className="text-[12px] text-[#64748B]">Paused</span>
                        ) : pct === null ? (
                          <span className="text-[12px] text-[#64748B]">No data yet</span>
                        ) : (
                          <div className="flex max-w-[160px] flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-semibold" style={{ color: readinessColor }}>{pct}%</span>
                              <span className="text-[12px] text-[#64748B]">
                                {readiness!.certified}/{readiness!.total} certified
                              </span>
                            </div>
                            <div className="h-[6px] w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: readinessColor }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-[16px] py-3 text-center">
                        {club.is_active ? (
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
                        {club.is_active ? (
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/super-admin/clubs/${club.id}`}
                              aria-label="View"
                              className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                            </Link>
                            <Link
                              href={`/super-admin/clubs/${club.id}/edit`}
                              aria-label="Edit"
                              className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/pencil.svg" alt="" width={13.5} height={13.5} />
                            </Link>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <form action={reactivateClubFormAction}>
                              <input type="hidden" name="club_id" value={club.id} />
                              <button
                                type="submit"
                                className="flex items-center gap-1 rounded-[8px] bg-[#F1F5F9] px-[10px] py-[4px] text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:bg-slate-200 transition-colors"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/icons/reactivate.svg" alt="" width={10.667} height={12.3} />
                                Reactivate
                              </button>
                            </form>
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
                <span className="font-bold text-[#5D626E]">{totalClubs}</span> Clubs
              </p>

              <div className="flex items-center gap-[6px]">
                {page <= 1 ? (
                  <span className="flex h-[22px] cursor-default items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] opacity-50">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={buildHref({ q, status, page: page - 1 })}
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
                      href={buildHref({ q, status, page: n })}
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
                    href={buildHref({ q, status, page: page + 1 })}
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
