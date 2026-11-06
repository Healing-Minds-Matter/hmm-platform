import Link from 'next/link'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { awardableTypes } from '@/lib/certifications.server'
import { todayDateString } from '@/lib/org-date'
import { BulkAwardButton } from '@/components/certifications/bulk-award-button'
import { ChampionGatekeeperFilters } from './champion-gatekeeper-filters'
import { CertChips } from '@/components/certifications/cert-chips'
import { CertListFilters } from '@/components/certifications/cert-list-filters'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { matchesCertFilter, personCertStatus } from '@/lib/cert-summary'
import { certCan } from '@/lib/certifications.server'

export const metadata = { title: 'Gatekeepers — HMM Champion' }

const PAGE_SIZE = 10

function buildHref(params: { q?: string; status?: string; cert?: string; cstatus?: string; page?: number }) {
  const usp = new URLSearchParams()
  if (params.q) usp.set('q', params.q)
  if (params.status) usp.set('status', params.status)
  if (params.cert) usp.set('cert', params.cert)
  if (params.cstatus) usp.set('cstatus', params.cstatus)
  if (params.page && params.page > 1) usp.set('page', String(params.page))
  const qs = usp.toString()
  return qs ? `/champion/gatekeepers?${qs}` : '/champion/gatekeepers'
}

export default async function ChampionGatekeepersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cert?: string; cstatus?: string; page?: string }>
}) {
  const { q, status, cert, cstatus, page: pageParam } = await searchParams
  const requestedPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const { data: profile } = await supabase.from('profiles').select('club_id').eq('id', user.id).single()
  if (!profile?.club_id) redirect('/champion')

  const todayStr = todayDateString()

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, phone, gatekeeper_code, is_active')
    .eq('club_id', profile.club_id)
    // The Champion is certified like a Gatekeeper, so their own row is listed
    // too; the dashboard's certification figures count them.
    .or(`role.eq.gatekeeper,id.eq.${user.id}`)
    // Sheet row 16: newest first, id breaks ties so paging is stable.
    .order('created_at', { ascending: false })
    .order('id')

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,gatekeeper_code.ilike.%${q}%`)

  const [{ data: gatekeepers }, certTypes, summary, mayRenew] = await Promise.all([query, awardableTypes(supabase), loadCertSummary(supabase), certCan(supabase, 'certifications.award')])
  const typeMap = new Map(summary.types.map(t => [t.id, t]))
  const allMatching = gatekeepers ?? []
  // The club's active Gatekeepers, for adding a certification to several at once (Story 10.5 Sc07).
  const { data: activeGatekeepers } = certTypes?.length
    ? await supabase.from('profiles').select('id, full_name, gatekeeper_code').eq('role', 'gatekeeper').eq('club_id', profile.club_id).eq('is_active', true).order('full_name')
    : { data: [] }

  const withStatus = allMatching
    .map(g => ({
      ...g,
      isSelf: g.id === user.id,
      // One certification status across all of the person's current certificates.
      status: personCertStatus(g.is_active, summary.byHolder.get(g.id)),
    }))
    // The Champion's own row first.
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf))

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
            Add, edit, and track your club&apos;s Gatekeepers and their certifications.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
        {certTypes && certTypes.length > 0 && (
          <BulkAwardButton
            types={certTypes}
            today={todayDateString()}
            people={(activeGatekeepers ?? []).map(g => ({ id: g.id, name: g.full_name, code: g.gatekeeper_code, clubId: profile.club_id, clubName: null }))}
          />
        )}
        <Link
          href="/champion/gatekeepers/new"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus-small.svg" alt="" width={10.5} height={10.5} />
          Add Gatekeeper
        </Link>
        </div>
      </div>

      <ChampionGatekeeperFilters q={q} status={status} />
      <CertListFilters types={summary.types} />

      <div className="overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white">
        {pageRows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">
            {q || status ? 'No gatekeepers match your filters.' : 'No gatekeepers yet.'}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
                  <th className="min-w-[240px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Gatekeeper &amp; Contact
                  </th>
                  <th className="min-w-[200px] px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]">
                    Certifications
                  </th>
                  <th className="w-[100px] px-[16px]" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(g => (
                  <tr key={g.id} className="h-[65px] border-t border-[rgba(226,232,240,0.5)] hover:bg-gray-50 transition-colors">
                    <td className="px-[16px] py-3">
                      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
                        {/* Sheet row 19: the name opens the profile — the Champion's own
                            row opens their own profile page. */}
                        <Link
                          href={g.isSelf ? '/champion/profile' : `/champion/gatekeepers/${g.id}`}
                          className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#265BA2]"
                        >
                          {g.full_name}
                        </Link>
                        {g.isSelf && <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">You · Champion</span>}
                      </div>
                      <div className="text-[13px] text-[#64748B]">{g.email}{g.phone ? ` • ${g.phone}` : ''}</div>
                      {g.gatekeeper_code && (
                        <div className="font-mono text-[11px] font-bold text-[#003495]">{g.gatekeeper_code}</div>
                      )}
                    </td>
                    <td className="px-[16px] py-3 text-[13px]">
                      {!g.is_active && <span className="mb-1 inline-flex rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#64748B]">Inactive</span>}
                      <CertChips certs={summary.byHolder.get(g.id) ?? []} types={typeMap} today={todayStr} renewBase={mayRenew && !g.isSelf ? `/champion/gatekeepers/${g.id}` : null} />
                    </td>
                    <td className="px-[16px] py-3">
                      {g.isSelf ? (
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href="/champion/profile"
                          aria-label="View my profile"
                          className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                        </Link>
                      </div>
                      ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/champion/gatekeepers/${g.id}`}
                          aria-label="View"
                          className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                        </Link>
                        {g.is_active ? (
                          <Link
                            href={`/champion/gatekeepers/${g.id}/edit`}
                            aria-label="Edit"
                            className="flex items-center justify-center rounded-[8px] p-2 hover:bg-gray-100 transition-colors"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/pencil.svg" alt="" width={13.5} height={13.5} />
                          </Link>
                        ) : (
                          <Link
                            href={`/champion/gatekeepers/${g.id}/reactivate`}
                            className="flex items-center gap-1 rounded-[8px] bg-[#F1F5F9] px-[10px] py-[4px] text-[11px] font-semibold tracking-[0.44px] text-[#003495] hover:bg-slate-200 transition-colors"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/reactivate.svg" alt="" width={10.667} height={12.3} />
                            Reactivate
                          </Link>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-[rgba(226,232,240,0.8)] bg-white py-[16px] pl-[25px] pr-[16px]">
              <p className="text-[10px] text-[#8492A6]">
                Showing <span className="font-bold text-[#5D626E]">{showingFrom} to {showingTo}</span> of{' '}
                <span className="font-bold text-[#5D626E]">{total}</span> {filtered.some(g => g.isSelf) ? 'people' : 'Gatekeepers'}
              </p>
              <div className="flex items-center gap-[6px]">
                {page <= 1 ? (
                  <span className="flex h-[22px] cursor-default items-center justify-center rounded-[4px] bg-[#F1F5F9] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] opacity-50">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={buildHref({ q, status, cert, cstatus, page: page - 1 })}
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
                    <Link key={n} href={buildHref({ q, status, cert, cstatus, page: n })} className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] text-[10px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-gray-100 transition-colors">
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
                    href={buildHref({ q, status, cert, cstatus, page: page + 1 })}
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
