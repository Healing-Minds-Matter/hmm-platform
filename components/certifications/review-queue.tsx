// Certifications → Reviews (Story 10.10 Sc01): self-reported certifications in
// the viewer's scope, filterable by Waiting for review / Verified / Removed /
// Everything. RLS decides the scope (Super Admins: everyone's; Champions: their
// own club's Gatekeepers); the viewer's own are left out, since nobody reviews
// their own. Used by both portals.
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayDateString } from '@/lib/org-date'
import { certCan } from '@/lib/certifications.server'
import { FILTER_STATE, REVIEW_FILTERS, SELF_REPORTED_COLUMNS, type ReviewFilter, type SelfReportedRow } from '@/lib/self-reported'
import { SelfReportedList } from '@/components/certifications/self-reported-list'

// The list only needs the certification itself, not the joined holder.
function withoutHolder<T extends { holder: unknown }>(row: T): Omit<T, 'holder'> {
  const copy: Partial<T> = { ...row }
  delete copy.holder
  return copy as Omit<T, 'holder'>
}

type Holder = { id: string; full_name: string; role: string; clubs: { name: string } | { name: string }[] | null }

export async function ReviewQueue({ portal, filter }: { portal: 'super_admin' | 'champion'; filter: ReviewFilter }) {
  const supabase = await createClient()
  const base = portal === 'super_admin' ? '/super-admin/certifications/reviews' : '/champion/certifications/reviews'
  const { data: { user } } = await supabase.auth.getUser()
  const [view, verify, reviewRemove] = await Promise.all(
    ['certifications.review.view', 'certifications.review.verify', 'certifications.review.remove'].map(p => certCan(supabase, p)))
  if (!view) {
    return <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#64748B]">You don’t have permission to review certifications.</div>
  }

  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from('self_reported_certificates')
      .select(`${SELF_REPORTED_COLUMNS}, holder:profiles!self_reported_certificates_holder_id_fkey(id, full_name, role, clubs!profiles_club_id_fkey(name))`)
      .in('state', FILTER_STATE[filter]).neq('holder_id', user?.id ?? '')
      .order('created_at', { ascending: filter !== 'waiting' ? false : true }),
    supabase.from('self_reported_certificates').select('state').neq('holder_id', user?.id ?? '').neq('state', 'withdrawn'),
  ])
  const rows = (data ?? []) as (SelfReportedRow & { holder: Holder | Holder[] | null })[]
  const tally: Record<ReviewFilter, number> = { waiting: 0, verified: 0, removed: 0, all: 0 }
  for (const c of counts ?? []) {
    tally.all++
    if (c.state === 'unverified') tally.waiting++
    else if (c.state === 'verified') tally.verified++
    else if (c.state === 'removed') tally.removed++
  }

  const holders: Record<string, { name: string; label: string; href: string | null }> = {}
  for (const r of rows) {
    const h = (Array.isArray(r.holder) ? r.holder[0] : r.holder) as Holder | null
    if (!h) continue
    const club = (Array.isArray(h.clubs) ? h.clubs[0] : h.clubs)?.name
    const role = h.role === 'champion' ? 'Champion' : 'Gatekeeper'
    holders[h.id] = {
      name: h.full_name,
      label: `${h.full_name} · ${role}${club ? ` · ${club}` : ''}`,
      href: portal === 'super_admin'
        ? `/super-admin/${h.role === 'champion' ? 'champions' : 'gatekeepers'}/${h.id}`
        : h.role === 'gatekeeper' ? `/champion/gatekeepers/${h.id}` : null,
    }
  }
  // Reviewer names for "Verified by …" (a Champion can't read Super Admin profiles).
  const reviewerIds = [...new Set(rows.map(r => r.reviewed_by).filter((v): v is string => !!v))]
  const names: Record<string, string> = {}
  if (reviewerIds.length) {
    const { data: people } = await createAdminClient().from('profiles').select('id, full_name, role').in('id', reviewerIds)
    for (const p of people ?? []) names[p.id] = `${p.full_name} (${p.role === 'super_admin' ? 'Super Admin' : 'Champion'})`
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Review filter" className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map(f => (
          <Link
            key={f.key}
            href={f.key === 'waiting' ? base : `${base}?show=${f.key}`}
            aria-current={f.key === filter ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              f.key === filter ? 'border-[#022C51] bg-[#022C51] text-white' : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9]'
            }`}
          >
            {f.label} ({tally[f.key]})
          </Link>
        ))}
      </nav>
      <div className="rounded-2xl bg-white p-6">
        <SelfReportedList
          rows={rows.map(withoutHolder)}
          perms={{ self: false, verify, reviewRemove }}
          names={names}
          today={todayDateString()}
          holders={holders}
          emptyText={filter === 'waiting' ? 'Nothing is waiting for review.' : 'Nothing to show.'}
        />
      </div>
    </div>
  )
}
