import Link from 'next/link'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CertificatesSection } from '@/components/certifications/certificates-section'
import { loadCertSummary } from '@/lib/cert-summary.server'
import { personCertStatus } from '@/lib/cert-summary'
import { PERSON_CERT_STATUS_LABEL } from '@/app/(dashboard)/super-admin/gatekeepers/gatekeeper-status'
import { ProfileForm } from '@/app/(dashboard)/super-admin/profile/profile-form'

export const metadata = { title: 'My Profile — HMM Champion' }

const AVATAR_BG = '#DCE9FF'
const AVATAR_TEXT = '#003495'

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// Whole days since a timestamp (computed per request, outside render logic).
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
}

export default async function ChampionProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const [{ data: profile }, { data: pwHistory }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, title, preferred_language, office_location, club_id, created_at, clubs!profiles_club_id_fkey(name)')
      .eq('id', user.id)
      .single(),
    supabase.from('password_history').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
  ])

  if (!profile) redirect(await loginPath())
  const myCerts = (await loadCertSummary(supabase)).byHolder.get(user.id) ?? []
  const myCertStatus = personCertStatus(true, myCerts)
  if (profile.role !== 'champion') redirect('/super-admin')

  // Real, not fabricated: pulls each currently-enabled permission for this
  // user (role default / group / individual override, whichever wins) via
  // the same resolution engine and catalog built for Epic 9 — not a
  // hardcoded capability list like the Super Admin profile's Card 4, which
  // describes a fixed system-wide role rather than a per-user resolved set.
  const { data: effectivePermissions } = await supabase.rpc('list_effective_permissions', { p_user_id: user.id })
  const { data: catalog } = await supabase.from('permission_catalog').select('key, label')
  const labelByKey = Object.fromEntries((catalog ?? []).map(c => [c.key, c.label]))
  const enabledPermissions = (effectivePermissions ?? [])
    .filter((p: { is_enabled: boolean }) => p.is_enabled)
    .map((p: { permission: string }) => labelByKey[p.permission] ?? p.permission)
    .sort()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = profile.clubs as any

  const lastPasswordChange = pwHistory?.[0]?.created_at ?? null
  const daysSincePasswordChange = lastPasswordChange ? daysSince(lastPasswordChange) : null

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const initials = getInitials(profile.full_name)

  return (
    <div className="p-8 font-[family-name:var(--font-inter)]">
      <div className="mb-8">
        <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">
          My Profile &amp; Account Settings
        </h1>
        <p className="mt-1 max-w-[707px] text-[14px] leading-5 text-[#475569]">
          Manage your personal information, communication preferences, and security settings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Card 1: Identity summary */}
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-[25px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-2xl shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]"
                  style={{ backgroundColor: AVATAR_BG }}
                >
                  <span className="text-[28px] font-bold tracking-[-0.56px] font-[family-name:var(--font-jakarta)]" style={{ color: AVATAR_TEXT }}>
                    {initials}
                  </span>
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#16A34A] shadow-[0px_0px_0px_4px_white]">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[22px] font-bold tracking-[-0.55px] text-[#0F172A] font-[family-name:var(--font-jakarta)]">
                    {profile.full_name}
                  </h2>
                  <span className="flex flex-shrink-0 items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-bold tracking-[0.275px] text-[#92400E]">
                    Champion
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c1-mail.svg" alt="" className="h-3 w-[15px]" />
                  <span className="truncate text-[13px] text-[#475569]">{profile.email}</span>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <span className="flex items-center gap-1 text-[12px] text-[#64748B]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/c1-calendar.svg" alt="" className="h-[12.5px] w-[11.25px]" />
                    Member since <span className="font-semibold text-[#0F172A]">{memberSince}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-[13px]">
              <span className="flex items-center gap-2 text-[13px] text-[#475569]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/c1-building.svg" alt="" className="h-[13.5px] w-[15px]" />
                {club ? club.name : 'No club assigned'}
              </span>
              <span className="text-[12px] text-[#64748B]">
                {myCertStatus === 'none'
                  ? 'No certifications on file'
                  : `${PERSON_CERT_STATUS_LABEL[myCertStatus]} · ${myCerts.length} certification${myCerts.length === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>

          {/* Card 2: Personal & Account Details */}
          <div className="rounded-2xl bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF4FF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c2-header-user.svg" alt="" className="h-[13.333px] w-[13.333px]" />
                </span>
                <h3 className="text-[18px] font-semibold text-[#0F172A] font-[family-name:var(--font-jakarta)]">
                  Personal &amp; Account Details
                </h3>
              </div>
              <span className="text-[12px] text-[#64748B]">Basic Info</span>
            </div>
            <ProfileForm
              initialFullName={profile.full_name}
              initialTitle={profile.title ?? ''}
              initialPhone={profile.phone ?? ''}
              initialLanguage={profile.preferred_language}
              initialOfficeLocation={profile.office_location ?? ''}
              email={profile.email}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Card 3: Security & Sign-in */}
          <div className="rounded-2xl bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF4FF]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/c3-header-security.svg" alt="" className="h-[16.667px] w-[16.667px]" />
              </span>
              <div>
                <h3 className="text-[18px] font-semibold text-[#0F172A] font-[family-name:var(--font-jakarta)]">Security &amp; Sign-in</h3>
                <p className="text-[12px] text-[#64748B]">Password &amp; Session Protection</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#F8FAFC] p-[13px] ring-1 ring-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c3-password-key.svg" alt="" className="h-2.5 w-[19.167px]" />
                </span>
                <div>
                  <p className="text-[12px] font-bold tracking-[0.24px] text-[#0F172A]">Account Password</p>
                  <p className="text-[13px] text-[#475569]">
                    {daysSincePasswordChange !== null
                      ? <>Last changed <span className="font-bold text-[#0F172A]">{daysSincePasswordChange} day{daysSincePasswordChange !== 1 ? 's' : ''} ago</span></>
                      : 'Never changed since account creation'}
                  </p>
                </div>
              </div>
              <Link
                href="/champion/profile/change-password"
                className="flex items-center gap-1.5 rounded-lg bg-white px-[15px] py-[7px] text-[12px] font-semibold tracking-[0.24px] text-[#0F172A] ring-1 ring-[#E5E7EB] transition-colors hover:bg-slate-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/c3-change-pw-btn.svg" alt="" className="h-3 w-3" />
                Change Password
              </Link>
            </div>
          </div>

          {/* Card 4: Role & Access */}
          <div className="rounded-2xl bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF4FF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c4-header-shield.svg" alt="" className="h-[16.667px] w-[15px]" />
                </span>
                <div>
                  <h3 className="text-[18px] font-semibold text-[#0F172A] font-[family-name:var(--font-jakarta)]">Role &amp; Access</h3>
                  <p className="text-[12px] text-[#64748B]">Club coordinator clearance</p>
                </div>
              </div>
              <span className="flex-shrink-0 rounded-full bg-[#E6EEFF] px-2.5 py-0.5 text-[11px] font-bold tracking-[0.44px] text-[#003495]">
                Champion
              </span>
            </div>

            {enabledPermissions.length === 0 ? (
              <p className="text-[13px] text-[#64748B]">No permissions currently enabled for your account.</p>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                {enabledPermissions.map((label: string) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(22,163,74,0.15)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/c4-checkmark.svg" alt="" className="h-[7px] w-[9.5px]" />
                    </span>
                    <span className="text-[13px] text-[#0F172A]">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CertificatesSection holderId={user.id} holderName={profile.full_name} />
      </div>
    </div>
  )
}
