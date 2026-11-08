import { RoleDefaultToggle } from './role-default-toggle'
import { CATEGORY_DISPLAY_TITLES, EVENTS_CATEGORY } from '@/lib/access-list'

export type ModuleItem = {
  key: string
  label: string
  description: string
  restrictedTo: string | null
  isEnabled: boolean
  deniedOverrideCount: number
  grantedOverrideCount: number
}

// Stored event-permission category; shown with its display title (lib/access-list.ts).
export { EVENTS_CATEGORY }

const CATEGORY_META: Record<string, { icon: string; blurb: string; title?: string }> = {
  'Community & Gatekeeper Management': {
    icon: '/icons/permissions/module-community.svg',
    blurb: 'Controls who can onboard and organize youth gatekeeper members.',
  },
  [EVENTS_CATEGORY]: {
    title: CATEGORY_DISPLAY_TITLES[EVENTS_CATEGORY],
    icon: '/icons/permissions/module-events.svg',
    blurb: 'Scheduling resilience workshops and recording participant attendance.',
  },
  'Club Communications & Broadcasts': {
    icon: '/icons/permissions/module-comms.svg',
    blurb: 'Managing notifications and public updates sent to club members.',
  },
  'Learning Resources & Library': {
    icon: '/icons/permissions/module-resources.svg',
    blurb: 'Access to clinical guides, slide presentations, and training handouts.',
  },
}

function ItemBadge({ item }: { item: ModuleItem }) {
  if (item.restrictedTo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/permissions/lock.svg" alt="" width={8} height={10.5} />
        {item.restrictedTo === 'super_admin' ? 'Super Admin Only' : `${item.restrictedTo} only`}
      </span>
    )
  }
  if (item.deniedOverrideCount > 0) {
    return (
      <span className="rounded-full border border-[#FECDD3] bg-[#FFF1F2] px-[9px] py-[3px] text-[11px] font-semibold text-[#9F1239]">
        {item.deniedOverrideCount} User Restricted
      </span>
    )
  }
  if (item.grantedOverrideCount > 0) {
    return (
      <span className="rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-[9px] py-[3px] text-[11px] font-semibold text-[#92400E]">
        {item.grantedOverrideCount} User Exception Active
      </span>
    )
  }
  return (
    <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]">
      Standard Default
    </span>
  )
}

export function ModuleCard({
  category,
  items,
  role,
}: {
  category: string
  items: ModuleItem[]
  role: 'champion' | 'gatekeeper'
}) {
  const meta = CATEGORY_META[category] ?? { icon: '/icons/permissions/module-community.svg', blurb: '' }
  const enabledCount = items.filter(i => i.isEnabled).length

  return (
    <div className="w-full overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[rgba(248,250,252,0.7)] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[rgba(204,251,241,0.7)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={meta.icon} alt="" className="max-h-[16px] max-w-[18px]" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-[#0F172A]">{meta.title ?? category}</h3>
            <p className="text-[12px] text-[#64748B]">{meta.blurb}</p>
          </div>
        </div>
        <span className="whitespace-nowrap text-[12px] font-medium text-[#64748B]">
          {enabledCount} of {items.length} Enabled
        </span>
      </div>
      <div className="w-full">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={`flex w-full items-center justify-between p-4 ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}
          >
            <div className="flex flex-col pr-4">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-[#1E293B]">{item.label}</span>
                <ItemBadge item={item} />
              </div>
              <p className="mt-0.5 text-[12px] leading-4 text-[#64748B]">{item.description}</p>
            </div>
            {item.restrictedTo ? (
              <span
                title={`Reserved for ${item.restrictedTo.replace('_', ' ')} — not assignable to this role`}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full bg-[#E2E8F0] opacity-60"
              >
                <span className="inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white" />
              </span>
            ) : (
              <RoleDefaultToggle key={role} role={role} permission={item.key} initialEnabled={item.isEnabled} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
