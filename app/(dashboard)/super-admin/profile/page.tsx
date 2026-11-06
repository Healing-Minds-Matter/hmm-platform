import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { syncProfileEmail } from '@/lib/email-sync.server'
import { ProfileForm } from './profile-form'
import { groupAccessList, type AccessRow } from '@/lib/access-list'
import { RoleAccessList } from '@/components/role-access-list'

export const metadata = { title: 'My Profile — HMM Super Admin' }

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  champion:    'Champion',
  gatekeeper:  'Gatekeeper',
}

// Deterministic avatar background/text colors, hashed from the user's id —
// same pattern as the Champions avatar hash in clubs/page.tsx.
const AVATAR_BG = '#DCE9FF'
const AVATAR_TEXT = '#003495'

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function delegationStatus(startsAt: string, endsAt: string, endedEarlyAt: string | null) {
  if (endedEarlyAt) return 'ended'
  const now = new Date()
  if (new Date(startsAt) > now) return 'scheduled'
  if (new Date(endsAt) <= now) return 'expired'
  return 'active'
}

// Whole days since a timestamp (computed per request, outside render logic).
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)))
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pick up a confirmed email change before reading the profile below.
  await syncProfileEmail(user.id, user.email)
  // Set by Supabase while a requested email change awaits confirmation.
  const pendingEmail = user.new_email ?? null

  const [{ data: profile }, { data: activeClubs }, { data: pwHistory }, { data: delegations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, title, preferred_language, office_location, created_at')
      .eq('id', user.id)
      .single(),
    supabase.from('clubs').select('id').eq('is_active', true),
    supabase.from('password_history').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    supabase
      .from('role_delegations')
      .select('id, starts_at, ends_at, ended_early_at, delegate:profiles!role_delegations_delegate_id_fkey(full_name)')
      .eq('delegator_id', user.id)
      .order('starts_at', { ascending: false }),
  ])

  if (!profile) redirect('/login')
  if (profile.role !== 'super_admin') redirect(profile.role === 'champion' ? '/champion' : '/login')

  const clubCount = (activeClubs ?? []).length
  // Sheet row 62: the Super Admin's effective permissions, with catalog labels.
  const { data: accessRows } = await supabase.rpc('my_access_list')
  const accessGroups = groupAccessList((accessRows ?? []) as AccessRow[])

  const lastPasswordChange = pwHistory?.[0]?.created_at ?? null
  const daysSincePasswordChange = lastPasswordChange ? daysSince(lastPasswordChange) : null

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  const activeDelegation = (delegations ?? [])
    .map(d => ({ ...d, delegate: Array.isArray(d.delegate) ? d.delegate[0] : d.delegate }))
    .find(d => delegationStatus(d.starts_at, d.ends_at, d.ended_early_at) === 'active')

  const initials = getInitials(profile.full_name)

  return (
    <div className="p-8 font-[family-name:var(--font-inter)]">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">
            Admin Profile &amp; Account Settings
          </h1>
          <p className="mt-1 max-w-[707px] text-[14px] leading-5 text-[#475569]">
            Manage your personal information, communication preferences, and security settings across the
            Healing Minds Matter network.
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
                    <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-[#EFF4FF] px-2.5 py-0.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/c1-super-admin-badge.svg" alt="" className="h-[12.25px] w-[12.833px]" />
                      <span className="text-[11px] font-bold tracking-[0.275px] text-[#003495]">Super Admin</span>
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
                      <img src="/icons/c1-id-badge.svg" alt="" className="h-[12.5px] w-[12.5px]" />
                      ID: <span className="font-semibold text-[#0F172A]">{user.id.slice(0, 8).toUpperCase()}</span>
                    </span>
                    <span className="text-[#CCDBF3]">•</span>
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
                  Central Oversight • All {clubCount} Regional Club{clubCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Card 2: Personal & Account Details */}
            <div id="personal-account-details" className="rounded-2xl bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
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
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF4FF]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/c3-header-security.svg" alt="" className="h-[16.667px] w-[16.667px]" />
                  </span>
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0F172A] font-[family-name:var(--font-jakarta)]">Security &amp; Sign-in</h3>
                    <p className="text-[12px] text-[#64748B]">Sign-in Email, Password &amp; Session Protection</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] p-[13px] ring-1 ring-[#E5E7EB]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/c2-email-field.svg" alt="" className="h-3 w-[15px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold tracking-[0.24px] text-[#0F172A]">Sign-in Email</p>
                      <p className="truncate text-[13px] text-[#475569]">{profile.email}</p>
                      {pendingEmail && (
                        <p className="mt-0.5 text-[12px] text-[#D97706]">
                          Pending change to <span className="font-semibold">{pendingEmail}</span> — confirm the links sent to both addresses
                        </p>
                      )}
                    </div>
                  </div>
                  <Link
                    href="/super-admin/profile/change-email"
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-[15px] py-[7px] text-[12px] font-semibold tracking-[0.24px] text-[#0F172A] ring-1 ring-[#E5E7EB] transition-colors hover:bg-slate-50"
                  >
                    {pendingEmail ? 'Change Again' : 'Change Email'}
                  </Link>
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
                    href="/super-admin/profile/change-password"
                    className="flex items-center gap-1.5 rounded-lg bg-white px-[15px] py-[7px] text-[12px] font-semibold tracking-[0.24px] text-[#0F172A] ring-1 ring-[#E5E7EB] transition-colors hover:bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/c3-change-pw-btn.svg" alt="" className="h-3 w-3" />
                    Change Password
                  </Link>
                </div>
              </div>
            </div>

            {/* Card 4: Role & Permissions */}
            <div className="rounded-2xl bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ring-1 ring-[#E5E7EB]">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF4FF]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/c4-header-shield.svg" alt="" className="h-[16.667px] w-[15px]" />
                  </span>
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#0F172A] font-[family-name:var(--font-jakarta)]">Role &amp; Permissions</h3>
                    <p className="text-[12px] text-[#64748B]">System-wide administrative clearance</p>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-[#E6EEFF] px-2.5 py-0.5 text-[11px] font-bold tracking-[0.44px] text-[#003495]">
                  {ROLE_LABELS[profile.role]}
                </span>
              </div>

              {/* Sheet row 62: generated from the effective permissions, not hard-coded. */}
              <div className="pt-3">
                <RoleAccessList groups={accessGroups} />
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F8FAFC] p-[13px] ring-1 ring-[#E5E7EB]">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/c4-out-of-office.svg" alt="" className="h-[15px] w-[13.5px]" />
                  <p className="text-[13px] text-[#475569]">
                    Coverage &amp; Out of Office:{' '}
                    {activeDelegation
                      ? <span className="font-bold text-[#0F172A]">{activeDelegation.delegate?.full_name} covering until {new Date(activeDelegation.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      : <span className="font-bold text-[#0F172A]">No active delegation scheduled</span>}
                  </p>
                </div>
                <Link href="/super-admin/permissions/delegations/new" className="flex-shrink-0 text-[12px] font-semibold tracking-[0.24px] text-[#003495] underline">
                  Set Out of Office
                </Link>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}
