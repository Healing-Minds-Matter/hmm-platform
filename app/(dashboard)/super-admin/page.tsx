import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/actions/dashboard'
import { BarChartWidget } from '@/components/dashboard/bar-chart-widget'
import { StackedBarWidget } from '@/components/dashboard/stacked-bar-widget'
import { OnboardingWidget } from '@/components/dashboard/onboarding-widget'
import { EventsWidget } from '@/components/dashboard/events-widget'
import { CertificationFiguresCard } from '@/components/certifications/certification-figures-card'
import { ExecutiveBanner } from '@/components/dashboard/executive-banner'

export const metadata = { title: 'Dashboard — HMM Super Admin' }

// ── QPR donut ring ────────────────────────────────────────────────────────────

function QprRing({ pct, size = 92 }: { pct: number; size?: number }) {
  const sw = 10
  const r  = (size - sw) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#E2E8F0" strokeWidth={sw} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke="#F4AC1E" strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text x={cx} y={cx - 3} textAnchor="middle" fontSize={18} fontWeight="800" fill="#0F172A">
        {Math.round(pct)}%
      </text>
      <text x={cx} y={cx + 12} textAnchor="middle" fontSize={9} fill="#64748B">Certified</text>
    </svg>
  )
}

function StatChip({ value, label, tone }: { value: number; label: string; tone: 'certified' | 'expiring' | 'neutral' }) {
  const styles = {
    certified: 'bg-[#F9F9F9] text-[#022C51]',
    expiring:  'bg-[rgba(255,251,235,0.6)] text-[#925F00]',
    neutral:   'bg-[#F9F9F9] text-[#475569]',
  }[tone]
  return (
    <div className={`flex flex-1 flex-col items-center rounded-lg px-2 py-2 ${styles}`}>
      <span className="text-xs font-bold">{value}</span>
      <span className="mt-0.5 text-center text-[10px] text-[#64748B]">{label}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SuperAdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') redirect('/champion')

  const data = await getDashboardData()

  const qprPct = data.qprData.total > 0
    ? (data.qprData.certified / data.qprData.total) * 100
    : 0
  const fullyCertified = Math.max(data.qprData.certified - data.qprData.expiringSoon, 0)
  const notYetCertified = Math.max(data.qprData.total - data.qprData.certified, 0)

  return (
    <div className="flex flex-col gap-5 p-6">

      <ExecutiveBanner activeClubCount={data.activeGatekeepersPerClub.length} />

      {/* ── Row 1: QPR Certified (5) · Total Champions (3) · Upcoming Events (4) ── */}
      <div className="grid grid-cols-12 gap-5">

        {/* QPR Certified Gatekeepers & Champions */}
        <div className="col-span-5 flex flex-col rounded-2xl bg-white p-5">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">QPR Certified Gatekeepers &amp; Champions</h2>
          <div className="mt-3 flex items-center gap-4 rounded-xl bg-[#F9F9F9] p-4">
            <QprRing pct={qprPct} />
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-jakarta)] text-[28px] font-extrabold tracking-tight text-[#0F172A]">
                  {data.qprData.certified.toLocaleString()}
                </span>
                <span className="text-[15px] text-[#64748B]">/ {data.qprData.total.toLocaleString()}</span>
              </p>
              <p className="mt-1 text-xs leading-snug text-[#475569]">
                Active Gatekeepers and Champions with a current QPR certificate, across all active clubs.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 border-t border-[#E2E8F0] pt-3">
            <StatChip value={fullyCertified} label="Valid" tone="certified" />
            <StatChip value={data.qprData.expiringSoon} label="Expiring soon" tone="expiring" />
            <StatChip value={notYetCertified} label="Not currently certified" tone="neutral" />
          </div>
        </div>

        {/* Total Champions */}
        <div className="col-span-3 flex flex-col rounded-2xl bg-white p-5">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Total Champions</h2>
          <p className="mt-2 font-[family-name:var(--font-jakarta)] text-[38px] font-black tracking-tight text-[#0F172A]">
            {data.totalActiveChampions.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#475569]">
            Dedicated coordinators leading mental health initiatives and guiding student gatekeepers.
          </p>
          <div className="mt-auto flex items-center gap-1.5 border-t border-[rgba(226,232,240,0.8)] pt-3 text-[11px] font-semibold text-[#1C1E21]">
            Active Champions across {data.activeGatekeepersPerClub.length} club{data.activeGatekeepersPerClub.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="col-span-4">
          <EventsWidget initialData={data.upcomingEvents} />
        </div>
      </div>

      {/* ── Row 2: Active Gatekeepers by Club (6) · Club Onboarding Progress (6) ── */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-6">
          <BarChartWidget data={data.activeGatekeepersPerClub} />
        </div>
        <div className="col-span-6">
          <OnboardingWidget initialData={data.onboardingProgress} initialMomChangePct={data.onboardingMomChangePct} />
        </div>
      </div>

      {/* ── Certifications by type (Story 10.12 Sc03) ── */}
      <CertificationFiguresCard scope={{ kind: 'all' }} />

      {/* ── Row 3: Gatekeeper Activity by Club (full width) ── */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12">
          <StackedBarWidget data={data.gatekeeperStatusPerClub} />
        </div>
      </div>

    </div>
  )
}
