import Link from 'next/link'
import { AnnouncementDeleteButton } from './announcement-delete-button'
import { computeStatus, AUDIENCE_LABEL, PRIORITY_BADGE } from './announcement-status'

export type AnnouncementCardData = {
  id: string
  title: string
  body: string
  publish_date: string
  expiry_date: string | null
  priority: 'standard' | 'mandatory' | 'urgent'
  audience: 'all' | 'champions' | 'gatekeepers' | 'specific_clubs'
  status: 'draft' | 'published'
  is_pinned: boolean
  club_name: string | null // "Specific Cohort": "All clubs" or the clubs' names
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

export function AnnouncementCard({
  announcement: a,
  basePath = '/super-admin/announcements',
  canManage = true,
}: {
  announcement: AnnouncementCardData
  basePath?: string
  canManage?: boolean
}) {
  const status = computeStatus(a.status, a.publish_date, a.expiry_date)
  const priorityBadge = PRIORITY_BADGE[a.priority]
  const audienceText = a.audience === 'specific_clubs' && a.club_name
    ? (a.club_name === 'All clubs' ? 'All Clubs' : `Selected Clubs: ${a.club_name}`)
    : AUDIENCE_LABEL[a.audience]

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {a.is_pinned && (
            <span className="flex items-center gap-1 rounded-full bg-[#F4AC1E] px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] text-[#2A1700]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pin.svg" alt="" className="h-[10px] w-[10px]" />
              Pinned
            </span>
          )}
          {priorityBadge && (
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${priorityBadge.cls}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={priorityBadge.icon} alt="" className="h-[10px] w-[10px]" />
              {priorityBadge.label}
            </span>
          )}
          <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] text-[#475569]">
            {audienceText}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.44px] ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <span className="whitespace-nowrap text-[12px] text-[#64748B]">
          Published {formatDate(a.publish_date)}
          {a.expiry_date ? ` · Expires ${formatDate(a.expiry_date)}` : ''}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[18px] font-bold leading-6 text-[#0F172A] font-[family-name:var(--font-jakarta)]">{a.title}</h3>
        <p className="line-clamp-2 text-[14px] leading-5 text-[#475569]">{a.body}</p>
      </div>

      {canManage && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Link
              href={`${basePath}/${a.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[11px] font-semibold tracking-[0.44px] text-[#0F172A] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E2E8F0] transition-colors hover:bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pencil.svg" alt="" width={12} height={12} />
              Edit
            </Link>
            <AnnouncementDeleteButton announcementId={a.id} />
          </div>
        </div>
      )}
    </div>
  )
}
