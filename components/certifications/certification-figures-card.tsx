// Dashboard certification figures (Story 10.12 Sc03): per certification type,
// how many are valid, expiring in 90 days and expired, and how many hold it;
// plus how many people have no certifications. Super Admins see active
// Champions and Gatekeepers in active clubs (the people the dashboards
// count); a Champion sees their club's active Gatekeepers and Champions.
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { certificationFigures } from '@/lib/cert-summary'

export async function CertificationFiguresCard({ scope }: { scope: { kind: 'all' } | { kind: 'club'; clubId: string } }) {
  const supabase = await createClient()
  let people: string[]
  if (scope.kind === 'club') {
    const { data } = await supabase.from('profiles').select('id').in('role', ['champion', 'gatekeeper']).eq('club_id', scope.clubId).eq('is_active', true)
    people = (data ?? []).map(p => p.id)
  } else {
    const { data: clubs } = await supabase.from('clubs').select('id').eq('is_active', true)
    const clubIds = (clubs ?? []).map(c => c.id)
    const { data } = clubIds.length
      ? await supabase.from('profiles').select('id').in('role', ['champion', 'gatekeeper']).eq('is_active', true).in('club_id', clubIds)
      : { data: [] }
    people = (data ?? []).map(p => p.id)
  }
  const summary = await loadCertSummary(supabase)
  const rows = [...summary.byHolder.values()].flat()
  const { perType, withoutCertifications } = certificationFigures(rows, people)
  const typeName = new Map(summary.types.map(t => [t.id, t]))
  // A Champion's numbers open their Gatekeepers list with the same filter.
  const link = (typeId: string | null, status?: string) => scope.kind === 'club'
    ? `/champion/gatekeepers?${new URLSearchParams({ cert: typeId ?? 'none', ...(status ? { cstatus: status } : {}) })}`
    : null
  const cell = (n: number, typeId: string, status?: string, tone = 'text-[#0F172A]') => {
    const href = link(typeId, status)
    const text = <span className={`tabular-nums ${n ? tone : 'text-[#94A3B8]'}`}>{n}</span>
    return href && n ? <Link href={href} className="hover:underline">{text}</Link> : text
  }
  const noneHref = link(null)

  return (
    <section className="rounded-2xl bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Certifications</h2>
          <p className="mt-1 text-[11px] text-[#64748B]">
            {scope.kind === 'club' ? 'Your club’s active Gatekeepers and Champions, by certification' : 'Active Champions and Gatekeepers in active clubs, by certification'}
          </p>
        </div>
        <p className="text-[13px] text-[#475569]">
          No certifications:{' '}
          {noneHref && withoutCertifications
            ? <Link href={noneHref} className="font-semibold text-[#0F172A] hover:underline">{withoutCertifications}</Link>
            : <span className="font-semibold text-[#0F172A]">{withoutCertifications}</span>}
          <span className="text-[#94A3B8]"> of {people.length}</span>
        </p>
      </div>
      {perType.length === 0 ? (
        <p className="mt-4 text-sm text-[#64748B]">No one {scope.kind === 'club' ? 'in your club ' : ''}holds a certification yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                <th className="py-2 pr-4">Certification</th>
                <th className="py-2 pr-4 text-right">Valid</th>
                <th className="py-2 pr-4 text-right">Expiring soon</th>
                <th className="py-2 pr-4 text-right">Expired</th>
                <th className="py-2 text-right">Holders</th>
              </tr>
            </thead>
            <tbody>
              {perType.map(f => (
                <tr key={f.typeId} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-2.5 pr-4 font-semibold text-[#0F172A]">{typeName.get(f.typeId)?.name ?? 'Unknown type'}</td>
                  <td className="py-2.5 pr-4 text-right">{cell(f.valid, f.typeId, 'valid', 'text-[#0D8275]')}</td>
                  <td className="py-2.5 pr-4 text-right">{cell(f.expiringSoon, f.typeId, 'expiring_soon', 'text-[#B45309]')}</td>
                  <td className="py-2.5 pr-4 text-right">{cell(f.expired, f.typeId, 'expired', 'text-[#DC2626]')}</td>
                  <td className="py-2.5 text-right">{cell(f.holders, f.typeId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
