import Link from 'next/link'
import { ResourceTypeIcon } from './resource-type-icon'
import { ResourceDeleteButton } from './resource-delete-button'
import { RESOURCE_TYPE_LABEL, RESOURCE_TYPE_PILL_ICON, resourceTypeVisual, categoryColor } from './design-tokens'
import { todayDateString } from '@/lib/org-date'

export interface ResourceRowData {
  id: string
  title: string
  description: string | null
  type: string
  category: string | null
  publication_date: string
  content_url: string | null
  status: string
  link: string | null
}

// Type-specific primary action, matching Figma's real per-type labels
// (Preview for video, Read for article, Download for document/other) —
// same underlying link/signed-URL the old "View" button used, just relabeled
// and iconed per type. Omitted entirely when there's nothing to open, same
// as the previous implementation's behavior.
const PRIMARY_ACTION: Record<string, { label: string; icon: string }> = {
  video:    { label: 'Preview',  icon: '/icons/eye.svg' },
  article:  { label: 'Read',     icon: '/icons/book-open-small.svg' },
  document: { label: 'Download', icon: '/icons/download-small.svg' },
  other:    { label: 'Download', icon: '/icons/download-small.svg' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ResourceRow({
  resource,
  basePath = '/super-admin/resources',
  canManage = true,
}: {
  resource: ResourceRowData
  basePath?: string
  canManage?: boolean
}) {
  const visual = resourceTypeVisual(resource.type)
  const typePillIcon = RESOURCE_TYPE_PILL_ICON[resource.type]
  const category = resource.category?.trim()
  const catColor = category ? categoryColor(category) : null
  const primaryAction = PRIMARY_ACTION[resource.type] ?? PRIMARY_ACTION.other

  return (
    <div className="flex w-full items-start justify-between gap-4 rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex flex-1 items-start gap-4">
        <div
          className="flex h-[112px] w-[176px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: visual.tint }}
        >
          <ResourceTypeIcon type={resource.type} />
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.44px]"
                style={{ backgroundColor: catColor!.bg, color: catColor!.text }}
              >
                {category}
              </span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold tracking-[0.44px] text-[#475569]">
              {typePillIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={typePillIcon} alt="" className="h-[9px] w-[11.5px]" />
              )}
              {RESOURCE_TYPE_LABEL[resource.type] ?? resource.type}
            </span>
            {resource.status === 'draft' && (
              <span className="flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-semibold tracking-[0.44px] text-[#92400E]">
                Draft
              </span>
            )}
            {/* Published with a future publication date: not visible to
                Champions/Gatekeepers until that date. */}
            {resource.status === 'published' && resource.publication_date > todayDateString() && (
              <span className="flex items-center gap-1 rounded-full bg-[#EFF4FF] px-2 py-0.5 text-[11px] font-semibold tracking-[0.44px] text-[#1E4BB8]">
                Scheduled
              </span>
            )}
          </div>

          <h3 className="font-[family-name:var(--font-jakarta)] text-[18px] font-bold leading-6 tracking-[-0.45px] text-[#0F172A]">
            {resource.title}
          </h3>

          {resource.description && (
            <p className="line-clamp-2 text-[13px] leading-[18px] text-[#475569]">
              {resource.description}
            </p>
          )}

          <div className="flex items-center gap-4 pt-2">
            <div className="flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/calendar-small.svg" alt="" className="h-[12.5px] w-[11.25px]" />
              <span className="text-[12px] text-[#64748B]">{formatDate(resource.publication_date)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col items-center justify-end gap-1.5">
        {/* Sheet rows 36/63: the whole article, read-only (Edit stays separate). */}
        {resource.type === 'article' && (
          <Link
            href={`${basePath}/${resource.id}`}
            aria-label={`View ${resource.title}`}
            className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[12px] font-semibold tracking-[0.24px] text-[#003495] hover:bg-slate-200 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/eye.svg" alt="" className="h-3 w-3" />
            View
          </Link>
        )}
        {resource.link && (
          <a
            href={resource.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[12px] font-semibold tracking-[0.24px] text-[#003495] hover:bg-slate-200 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={primaryAction.icon} alt="" className="h-3 w-3" />
            {primaryAction.label}
          </a>
        )}
        {canManage && (
          <>
            <Link
              href={`${basePath}/${resource.id}/edit`}
              className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[12px] font-semibold tracking-[0.24px] text-[#475569] hover:bg-slate-200 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pencil.svg" alt="" className="h-3 w-3" />
              Edit
            </Link>
            <ResourceDeleteButton resourceId={resource.id} />
          </>
        )}
      </div>
    </div>
  )
}
