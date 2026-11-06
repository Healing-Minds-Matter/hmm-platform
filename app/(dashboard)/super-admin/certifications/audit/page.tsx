import { createClient } from '@/lib/supabase/server'
import { waitingReviewCount } from '@/lib/certifications.server'
import { AUDIT_ACTION_LABEL, auditTone, describeAudit } from '@/lib/certification-types'
import { formatOrgDate, formatOrgTime } from '@/lib/org-date'
import { Badge, CertTabs, PageHeader } from '@/components/certifications/cert-ui'

export const metadata = { title: 'Certifications audit history — HMM Super Admin' }

const PAGE = 300

// Certifications audit history (Story 10.16) — Super Admins only (the route is
// under /super-admin, and audit_logs can only be read by Super Admins).
export default async function CertificationAuditPage({ searchParams }: { searchParams: Promise<{ action?: string; q?: string }> }) {
  const { action = '', q = '' } = await searchParams
  const supabase = await createClient()
  let query = supabase
    .from('audit_logs')
    .select('id, action, details, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name)')
    .like('action', 'certification.%')
    .order('created_at', { ascending: false })
    .limit(PAGE)
  if (action && AUDIT_ACTION_LABEL[action]) query = query.eq('action', action)
  const [{ data }, waiting] = await Promise.all([query, waitingReviewCount(supabase)])

  const needle = q.trim().toLowerCase()
  const rows = (data ?? []).map(r => {
    const details = (r.details ?? {}) as Record<string, unknown>
    const actor = (Array.isArray(r.actor) ? r.actor[0] : r.actor) as { full_name?: string } | null
    return {
      id: r.id,
      action: r.action,
      when: r.created_at,
      subject: typeof details.subject === 'string' ? details.subject : '—',
      text: describeAudit(r.action, details),
      by: typeof details.actor === 'string' ? details.actor : actor?.full_name ?? 'System',
    }
  }).filter(r => !needle || `${AUDIT_ACTION_LABEL[r.action] ?? ""} ${r.subject} ${r.text} ${r.by}`.toLowerCase().includes(needle))

  const th = 'px-[16px] text-left text-[11px] font-semibold uppercase tracking-[0.55px] text-[#475569]'
  return (
    <div className="flex flex-col gap-4 p-8 font-[family-name:var(--font-inter)]">
      <PageHeader title="Certifications" description="Every change to certifications, types and designs: who did it, when and why. Only Super Admins can see this." />
      <CertTabs current="audit" base="/super-admin/certifications" showAudit reviews={waiting} />

      <form className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-6 py-3">
        <label htmlFor="action" className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Action</label>
        <select id="action" name="action" defaultValue={action} className="rounded-lg border border-transparent bg-[#F9F9F9] py-2 pl-4 pr-8 text-[13px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40">
          <option value="">All actions</option>
          {Object.entries(AUDIT_ACTION_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <label htmlFor="q" className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, certification or reason" className="min-w-[260px] rounded-lg border border-transparent bg-[#F9F9F9] px-4 py-2 text-[13px] text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#F4AC1E]/40" />
        <button type="submit" className="rounded-lg bg-[#F1F5F9] px-4 py-2 text-[12px] font-semibold text-[#003495] hover:bg-slate-200">Apply</button>
        <span className="text-[12px] text-[#64748B]">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}{(data ?? []).length === PAGE ? ` (latest ${PAGE})` : ''}</span>
      </form>

      <div className="overflow-x-auto rounded-[12px] border border-[#E2E8F0] bg-white">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">{action || q ? 'No entries match.' : 'No certification activity yet.'}</div>
        ) : (
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="h-[46px] border-b border-[rgba(226,232,240,0.8)] bg-[#F9F9F9]">
                <th className={th}>Date</th><th className={th}>Action</th><th className={th}>Person or type</th><th className={th}>Details</th><th className={th}>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-[rgba(226,232,240,0.5)] align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-[16px] py-3 text-[13px] text-[#475569]">{formatOrgDate(r.when, { day: 'numeric', month: 'short', year: 'numeric' })}<span className="block text-[12px] text-[#94A3B8]">{formatOrgTime(r.when, { hour: 'numeric', minute: '2-digit' })}</span></td>
                  <td className="px-[16px] py-3"><Badge tone={auditTone(r.action)}>{AUDIT_ACTION_LABEL[r.action] ?? r.action}</Badge></td>
                  <td className="px-[16px] py-3 text-[13px] font-semibold text-[#0F172A]">{r.subject}</td>
                  <td className="px-[16px] py-3 text-[13px] text-[#0F172A]">{r.text}</td>
                  <td className="px-[16px] py-3 text-[13px] text-[#64748B]">{r.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[12px] text-[#64748B]">Entries are kept permanently.</p>
    </div>
  )
}
