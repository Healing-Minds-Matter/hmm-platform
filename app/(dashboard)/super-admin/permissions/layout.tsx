import { PermissionsSubNav } from './permissions-sub-nav'

export const metadata = { title: 'Permissions — HMM Super Admin' }

// No page-wide action button here: each tab has its own "add" button for
// what it manages (Add Individual Exception on Role Defaults' Active
// Exceptions panel and on Individual Exceptions; Create on Groups and
// Delegations). A header "Add Custom Exception" button used to sit here on
// every tab, duplicating the exceptions buttons under a different name.
export default function PermissionsLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div>
        <h1 className="text-[24px] font-bold tracking-[-0.6px] leading-[32px] text-[#0F172A]">
          Permissions & Access Controls
        </h1>
        <p className="mt-1 max-w-[620px] text-[14px] leading-5 text-[#64748B]">
          Easily manage default capabilities for Champions and Gatekeepers, handle individual
          temporary adjustments, and maintain a secure community.
        </p>
      </div>
      <PermissionsSubNav />
      {children}
      {modal}
    </div>
  )
}
