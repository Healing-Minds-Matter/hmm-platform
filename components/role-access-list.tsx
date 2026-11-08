import type { AccessGroup } from '@/lib/access-list'

// The Role & Access list on both profile pages (sheet row 62), generated from
// the user's effective permissions — never a hard-coded list.
export function RoleAccessList({ groups }: { groups: AccessGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-[13px] text-[#64748B]">No permissions currently enabled for your account.</p>
  }
  return (
    <div className="flex flex-col gap-3 pt-1">
      {groups.map(g => (
        <div key={g.category}>
          <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{g.title}</h4>
          <ul className="flex flex-col gap-2">
            {g.items.map(item => (
              <li key={item.key} className="flex items-center gap-2.5">
                <span aria-hidden className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(22,163,74,0.15)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c4-checkmark.svg" alt="" className="h-[7px] w-[9.5px]" />
                </span>
                <span className="text-[13px] text-[#0F172A]">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
