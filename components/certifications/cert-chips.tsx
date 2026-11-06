// A person's current certificates in a list row (Story 10.12 Sc01): each with
// its own status colour and expiry, a Renew link where it can be renewed
// (Story 10.7 Sc01), or "No certifications".
import Link from 'next/link'
import { CHIP_TONE, certChipText, listStatusOf, type CurrentCert } from '@/lib/cert-summary'

export function CertChips({ certs, types, today, renewBase }: {
  certs: CurrentCert[]
  types: Map<string, { code: string; name: string; status: string }>
  today: string
  renewBase?: string | null      // the person's profile URL when the viewer may renew; null hides Renew
}) {
  if (!certs.length) return <span className="text-[12px] text-[#94A3B8]">No certifications</span>
  const sorted = [...certs].sort((a, b) => (types.get(a.type_id)?.code ?? '').localeCompare(types.get(b.type_id)?.code ?? ''))
  return (
    <div className="flex flex-col items-start gap-1">
      {sorted.map(c => {
        const t = types.get(c.type_id)
        const renewable = renewBase && (c.status === 'expired' || c.status === 'stopped') && t?.status !== 'retired'
        return (
          <div key={c.id} className="flex items-center gap-1.5">
            <span title={t?.name} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP_TONE[listStatusOf(c.status)]}`}>
              <span className="font-mono">{t?.code ?? '?'}</span>
              <span className="font-normal">· {certChipText(c, today)}</span>
            </span>
            {renewable && (
              <Link href={`${renewBase}?renew=${c.id}`} className="text-[11px] font-semibold text-[#265BA2] hover:underline">Renew</Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
