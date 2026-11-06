import Link from 'next/link'
import { TYPE_TEXT, programmePeriodLabel, validityLabel, type CertificationTypeRow } from '@/lib/certification-types'
import { Code, TypeStatusBadge } from './cert-ui'

// The list of certification types (Story 10.1 Sc05). Super Admins also see
// holders and View / Edit actions; Champions see the list only.
export function TypesTable({ types, holders, manage, base }: {
  types: CertificationTypeRow[]
  holders: Record<string, number>
  manage: boolean
  base: string
}) {
  const th = 'px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]'
  if (types.length === 0) {
    return <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#64748B]">No certification types yet.</div>
  }
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#E2E8F0] bg-white">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
            <th className={th}>Name</th>
            <th className={th}>Code</th>
            <th className={th}>{TYPE_TEXT.validityLabel}</th>
            <th className={th}>{TYPE_TEXT.periodLabel}</th>
            <th className={th}>Status</th>
            {manage && <th className={th}>Holders</th>}
            {manage && <th className="w-[100px] px-[16px]"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {types.map(t => (
            <tr key={t.id} className="h-[65px] border-t border-[rgba(226,232,240,0.5)] transition-colors hover:bg-gray-50">
              <td className="px-[16px] py-3">
                <div className="text-[13px] font-semibold text-[#0F172A]">{t.name}</div>
                {t.created_from_existing && <div className="text-[11px] text-[#64748B]">Created from the existing QPR dates</div>}
              </td>
              <td className="px-[16px] py-3"><Code>{t.code}</Code></td>
              <td className="px-[16px] py-3 text-[13px] text-[#0F172A]">{validityLabel(t)}</td>
              <td className="px-[16px] py-3 text-[13px] text-[#0F172A]">{programmePeriodLabel(t)}</td>
              <td className="px-[16px] py-3"><TypeStatusBadge type={t} /></td>
              {manage && <td className="px-[16px] py-3 text-[13px] tabular-nums text-[#0F172A]">{holders[t.id] ?? 0}</td>}
              {manage && (
                <td className="px-[16px] py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`${base}/${t.id}`} aria-label={`View ${t.name}`} className="flex items-center justify-center rounded-[8px] p-2 transition-colors hover:bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/eye.svg" alt="" width={16.5} height={11.25} />
                    </Link>
                    <Link href={`${base}/${t.id}/edit`} aria-label={`Edit ${t.name}`} className="flex items-center justify-center rounded-[8px] p-2 transition-colors hover:bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/pencil.svg" alt="" width={13.5} height={13.5} />
                    </Link>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
