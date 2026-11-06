import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { awardableTypes } from '@/lib/certifications.server'
import { todayDateString } from '@/lib/org-date'
import { BulkAwardButton } from '@/components/certifications/bulk-award-button'
import { GatekeeperFilters } from './gatekeeper-filters'
import { CertChips } from '@/components/certifications/cert-chips'
import { CertListFilters } from '@/components/certifications/cert-list-filters'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { matchesCertFilter, personCertStatus } from '@/lib/cert-summary'
import { certCan } from '@/lib/certifications.server'

export const metadata = { title: 'Gatekeepers — HMM Super Admin' }

const PAGE_SIZE = 10

function buildHref(params: { q?: string; club?: string; status?: string; champion?: string; cert?: string; cstatus?: string; page?: number }) {
  const usp = new URLSearchParams()
  if (params.q) usp.set('q', params.q)
  if (params.club) usp.set('club', params.club)
  if (params.status) usp.set('status', params.status)
  if (params.champion) usp.set('champion', params.champion)
  if (params.cert) usp.set('cert', params.cert)
  if (params.cstatus) usp.set('cstatus', params.cstatus)
  if (params.page && params.page > 1) usp.set('page', String(params.page))
  const qs = usp.toString()
  return qs ? `/super-admin/gatekeepers?${qs}` : '/super-admin/gatekeepers'
}

export default async function GatekeepersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; club?: string; status?: string; champion?: string; cert?: string; cstatus?: string; page?: string }>
}) {
  const { q, club: clubFilter, status, champion: championFilter, cert, cstatus, page: pageParam } = await searchParams
  const requestedPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const supabase = await createClient()
  const todayStr = todayDateString()

  const [{ data: clubs }, { data: champions }, certTypes, { data: activeGatekeepers }] = await Promise.all([
    supabase.from('clubs').select('id, name, club_code, is_active').order('name'),
    supabase.from('profiles').select('id, full_name, club_id').eq('role', 'champion').eq('is_active', true).order('full_name'),
    awardableTypes(supabase),
    // Everyone a certification can be added to in one go (Story 10.5 Sc07).
    supabase.from('profiles').select('id, full_name, gatekeeper_code, club_id').eq('role', 'gatekeeper').eq('is_active', true).order('full_name'),
  ])

  const clubList = clubs ?? []
  const clubById = Object.fromEntries(clubList.map(c => [c.id, c]))
  const championByClub = Object.fromEntries((champions ?? []).map(c => [c.club_id, c]))
  const activeClubCount = clubList.filter(c => c.is_active).length

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, phone, gatekeeper_code, is_active, club_id')
    .eq('role', 'gatekeeper')
    // Sheet row 16: newest first, id breaks ties so paging is stable.
    .order('created_at', { ascending: false })
    .order('id')

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,gatekeeper_code.ilike.%${q}%`)
  if (clubFilter) query = query.eq('club_id', clubFilter)
  if (championFilter) {
    const champ = (champions ?? []).find(c => c.id === championFilter)
    query = query.eq('club_id', champ?.club_id ?? '00000000-0000-0000-0000-000000000000')
  }

  const [{ data: gatekeepers }, summary, mayRenew] = await Promise.all([query, loadCertSummary(supabase), certCan(supabase, 'certifications.award')])
  const allMatching = gatekeepers ?? []
  const typeMap = new Map(summary.types.map(t => [t.id, t]))

  // Status = one certification status across all of the person's current certificates.
  const withStatus = allMatching.map(g => ({
    ...g,
    status: personCertStatus(g.is_active, summary.byHolder.get(g.id)),
  }))

  const filtered = withStatus
    .filter(g => !status || g.status === status)
    .filter(g => matchesCertFilter(summary.byHolder.get(g.id) ?? [], cert, cstatus))

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const from = (page - 1) * PAGE_SIZE
  const pageRows = filtered.slice(from, from + PAGE_SIZE)

  const showingFrom = total === 0 ? 0 : from + 1
  const showingTo = Math.min(from + pageRows.length, total)

  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Gatekeeper Management</h1>
          <p className="mt-1 text-sm text-[#475569]">
            Monitor, search, and manage Gatekeepers and their certifications across all {activeClubCount} active regional clubs.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
        {certTypes && certTypes.length > 0 && (
          <BulkAwardButton
            types={certTypes}
            today={todayDateString()}
            clubs={clubList.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name }))}
            people={(activeGatekeepers ?? []).map(g => ({ id: g.id, name: g.full_name, code: g.gatekeeper_code, clubId: g.club_id, clubName: clubById[g.club_id ?? '']?.name ?? null }))}
          />
        )}
        <Link
          href="/super-admin/gatekeepers/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Add Gatekeeper
        </Link>
        </div>
      </div>

      <GatekeeperFilters
        q={q}
        clubFilter={clubFilter}
        status={status}
        championFilter={championFilter}
        clubs={clubList.filter(c => c.is_active)}
        champions={champions ?? []}
      />
      <CertListFilters types={summary.types} />

      <div className="overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white">
        {pageRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">
            {q || clubFilter || status || championFilter || cert || cstatus ? 'No gatekeepers match your filters.' : 'No gatekeepers yet.'}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
                  <th className="min-w-[240px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Gatekeeper &amp; Contact
                  </th>
                  <th className="min-w-[160px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Assigned Club
                  </th>
                  <th className="min-w-[160px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Assigned Champion
                  </th>
                  <th className="min-w-[200px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Certifications
                  </th>
                  <th className="w-[100px] px-[16px]" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(g => {
                  const club = g.club_id ? clubById[g.club_id] : null
                  const champion = g.club_id ? championByClub[g.club_id] : null
                  return (
                    <tr key={g.id} className="h-[65px] border-t border-[rgba(226,232,240,0.5)] hover:bg-gray-50 transition-colors">
                      <td className="px-[16px] py-3">
                        <div className="text-[13px] font-semibold text-[#0F172A]">{g.full_name}</div>
                        <div className="text-[13px] text-[#64748B]">{g.email}{g.phone ? ` • ${g.phone}` : ''}</div>
                        {g.gatekeeper_code && (
                          <div className="font-mono text-[11px] font-bold text-[#003495]">{g.gatekeeper_code}</div>
                        )}
                      </td>
                      <td className="px-[16px] py-3 text-[13px] font-medium text-[#0F172A]">
                        {club ? <>{club.name}<div className="text-[11px] font-normal text-[#94A3B8]">{club.club_code ?? ''}</div></> : '—'}
                      </td>
                      <td className="px-[16px] py-3 text-[13px] text-[#0F172A]">
                        {champion ? champion.full_name : <span className="text-[#94A3B8]">No active champion</span>}
                      </td>
                      <td className="px-[16px] py-3 text-[13px]">
                        {!g.is_active && <span className="mb-1 inline-flex rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#64748B]">Inactive</span>}
                        <CertChips certs={summary.byHolder.get(g.id) ?? []} types={typeMap} today={todayStr} renewBase={mayRenew ? `/super-admin/gatekeepers/${g.id}` : null} />
                      </td>
                      <td className="px-[16px] py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/super-admin/gatekeepers/${g.id}`}
                            aria-label="View"
                            className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                          </Link>
                          {g.is_active ? (
                            <Link
                              href={`/super-admin/gatekeepers/${g.id}/edit`}
                              aria-label="Edit"
                              className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/pencil.svg" alt="" width={13.5} height={13.5} />
                            </Link>
                          ) : (
                            <Link
                              href={`/super-admin/gatekeepers/${g.id}/reactivate`}
                              className="flex items-center gap-1 rounded-[8px] bg-[#F1F5F9] px-[10px] py-[4px] text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:bg-slate-200 transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/icons/reactivate.svg" alt="" width={10.667} height={12.3} />
                              Reactivate
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-[rgba(226,232,240,0.8)] bg-white py-[16px] pl-[25px] pr-[16px]">
              <p className="text-[10px] text-[#8492A6]">
                Showing <span className="font-bold text-[#5D626E]">{showingFrom} to {showingTo}</span> of{' '}
                <span className="font-bold text-[#5D626E]">{total}</span> Gatekeepers
              </p>
              <div className="flex items-center gap-[6px]">
                {page <= 1 ? (
                  <span className="flex h-[22px] cursor-default items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] opacity-50">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={buildHref({ q, club: clubFilter, status, champion: championFilter, cert, cstatus, page: page - 1 })}
                    className="flex h-[22px] items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-slate-200 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map(n => (
                  n === page ? (
                    <span key={n} className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] bg-[#012C51] text-[10px] font-bold tracking-[0.24px] text-white">
                      {n}
                    </span>
                  ) : (
                    <Link key={n} href={buildHref({ q, club: clubFilter, status, champion: championFilter, cert, cstatus, page: n })} className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-gray-100 transition-colors">
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
                    href={buildHref({ q, club: clubFilter, status, champion: championFilter, cert, cstatus, page: page + 1 })}
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
