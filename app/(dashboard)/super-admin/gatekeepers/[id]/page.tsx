import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GatekeeperStatusControls } from './gatekeeper-status-controls'
import { ResendInviteButton } from './resend-invite-button'
import { qprStatus, QPR_STATUS_LABEL, QPR_STATUS_BADGE, QPR_STATUS_DOT, todayBounds } from '../gatekeeper-status'

export const metadata = { title: 'Gatekeeper Details — HMM Super Admin' }

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function GatekeeperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { today, in90Days } = todayBounds()

  const { data: gatekeeper } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, gatekeeper_code, is_active, deactivation_reason, club_id, preferred_language, qpr_certification_date, qpr_expiry_date, created_at, clubs!profiles_club_id_fkey(id, name, club_code, is_active)')
    .eq('id', id)
    .eq('role', 'gatekeeper')
    .single()

  if (!gatekeeper) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const club = gatekeeper.clubs as any

  const { data: champion } = club
    ? await supabase.from('profiles').select('id, full_name, email').eq('club_id', club.id).eq('role', 'champion').eq('is_active', true).maybeSingle()
    : { data: null }

  const status = qprStatus(gatekeeper.is_active, gatekeeper.qpr_expiry_date, today, in90Days)

  return (
    <div className="flex flex-col gap-6 p-6 font-[family-name:var(--font-inter)]">
      <nav className="flex items-center gap-2 text-xs">
        <Link href="/super-admin/gatekeepers" className="text-[#64748B] hover:text-[#022C51]">Gatekeepers</Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/chevron-right-breadcrumb.svg" alt="" className="h-[7px] w-[4px]" />
        <span className="font-medium text-[#022C51]">{gatekeeper.full_name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-white p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-[#012C51] text-2xl font-bold text-white">
            {getInitials(gatekeeper.full_name)}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-bold tracking-[-0.22px] text-[#0F172A]">{gatekeeper.full_name}</h1>
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${QPR_STATUS_BADGE[status]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${QPR_STATUS_DOT[status]}`} />
                {QPR_STATUS_LABEL[status]}
              </span>
              {gatekeeper.gatekeeper_code && (
                <span className="font-mono text-xs font-bold text-[#003495]">{gatekeeper.gatekeeper_code}</span>
              )}
            </div>
            <p className="text-sm text-[#475569]">
              {club ? (
                <Link href={`/super-admin/clubs/${club.id}`} className="text-[#003495] hover:underline">
                  {club.name}{club.club_code ? ` (${club.club_code})` : ''}
                </Link>
              ) : 'No club assigned'}
              {club && !club.is_active && <span className="ml-1 text-xs text-[#DC2626]">(inactive)</span>}
              {champion && <> • Champion: {champion.full_name}</>}
            </p>
            {!gatekeeper.is_active && gatekeeper.deactivation_reason && (
              <p className="text-xs text-[#94A3B8]">
                {gatekeeper.deactivation_reason === 'club_deactivated' ? 'Deactivated when club was deactivated' : 'Manually deactivated'}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/mail.svg" alt="" width={15} height={12} />
                <span className="text-[13px] text-[#0F172A]">{gatekeeper.email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/phone.svg" alt="" width={13.5} height={13.5} />
                <span className="text-[13px] text-[#0F172A]">{gatekeeper.phone ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {gatekeeper.is_active && (
            <Link
              href={`/super-admin/gatekeepers/${id}/edit`}
              className="flex items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#DB9A15]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pencil.svg" alt="" className="h-3 w-3 brightness-0 invert" />
              Edit Gatekeeper
            </Link>
          )}
          {gatekeeper.is_active && <ResendInviteButton gatekeeperId={id} />}
          <GatekeeperStatusControls gatekeeperId={id} isActive={gatekeeper.is_active} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-2xl bg-white p-6 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Certification Date</p>
          <p className="mt-1 text-sm text-[#0F172A]">{gatekeeper.qpr_certification_date ? formatDate(gatekeeper.qpr_certification_date) : 'Not on file'}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Expiry Date</p>
          <p className="mt-1 text-sm text-[#0F172A]">{gatekeeper.qpr_expiry_date ? formatDate(gatekeeper.qpr_expiry_date) : 'Not on file'}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Preferred Language</p>
          <p className="mt-1 text-sm text-[#0F172A]">
            {{ en: 'English', si: 'Sinhala', ta: 'Tamil' }[gatekeeper.preferred_language as string] ?? gatekeeper.preferred_language}
          </p>
        </div>
      </div>
    </div>
  )
}
