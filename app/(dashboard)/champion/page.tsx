import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getChampionDashboardData } from '@/actions/champion-dashboard'
import { CertificationFiguresCard } from '@/components/certifications/certification-figures-card'
import { MonthlyTrendWidget } from '@/components/champion-dashboard/monthly-trend-widget'
import { OnboardingStatusWidget } from '@/components/champion-dashboard/onboarding-status-widget'
import { ClubEventsSummary } from '@/components/champion-dashboard/club-events-summary'

export const metadata = { title: 'Dashboard — HMM Champion' }

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  caption,
  captionTone = 'neutral',
  iconSrc,
}: {
  label: string
  value: string
  caption: string
  captionTone?: 'positive' | 'neutral'
  iconSrc: string
}) {
  return (
    <div className="flex flex-1 flex-col justify-between rounded-2xl bg-white p-6 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between pb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{label}</span>
        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" width={16} height={16} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-[family-name:var(--font-jakarta)] text-[36px] font-bold leading-[44px] tracking-[-0.72px] text-[#0F172A]">
          {value}
        </p>
        <p className={`text-[12px] ${captionTone === 'positive' ? 'font-semibold text-[#0D8275]' : 'text-[#475569]'}`}>
          {caption}
        </p>
      </div>
    </div>
  )
}

// ── Active vs Inactive donut ─────────────────────────────────────────────────

function ActiveInactiveDonut({ active, inactive }: { active: number; inactive: number }) {
  const total = active + inactive
  const size = 150
  const sw = 22
  const r = (size - sw) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const activePct = total > 0 ? active / total : 0
  const activeDash = activePct * circ

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#F4AC1E" strokeWidth={sw} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="#022C51" strokeWidth={sw}
          strokeDasharray={`${activeDash} ${circ - activeDash}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        <text x={cx} y={cx - 4} textAnchor="middle" fontSize={26} fontWeight="800" fill="#0F172A">{total}</text>
        <text x={cx} y={cx + 16} textAnchor="middle" fontSize={11} fill="#64748B">Total Gatekeepers</text>
      </svg>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[#022C51]" />
          <span className="text-[13px] font-semibold text-[#0F172A]">Active</span>
          <span className="text-[12px] text-[#64748B]">{active} ({total > 0 ? Math.round(activePct * 100) : 0}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[#F4AC1E]" />
          <span className="text-[13px] font-semibold text-[#0F172A]">Inactive</span>
          <span className="text-[12px] text-[#64748B]">{inactive} ({total > 0 ? Math.round((1 - activePct) * 100) : 0}%)</span>
        </div>
      </div>
    </div>
  )
}

// ── QPR certification bar ────────────────────────────────────────────────────

function QprCertificationBar({ certified, expiringSoon, total }: { certified: number; expiringSoon: number; total: number }) {
  const fullyCertified = Math.max(certified - expiringSoon, 0)
  const notCertified = Math.max(total - certified, 0)
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[52px] w-full overflow-hidden rounded-lg">
        <div className="flex items-center justify-center bg-[#4DB5A9]" style={{ width: `${pct(fullyCertified)}%` }}>
          {fullyCertified > 0 && <span className="text-[13px] font-semibold text-white">{fullyCertified}</span>}
        </div>
        <div className="flex items-center justify-center bg-[#F4AC1E]" style={{ width: `${pct(expiringSoon)}%` }}>
          {expiringSoon > 0 && <span className="text-[13px] font-semibold text-[#022C51]">{expiringSoon}</span>}
        </div>
        <div className="flex items-center justify-center bg-[#022C51]" style={{ width: `${pct(notCertified)}%` }}>
          {notCertified > 0 && <span className="text-[13px] font-semibold text-white">{notCertified}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#4DB5A9]" />
          <span className="text-[13px] font-semibold text-[#0F172A]">Valid</span>
          <span className="text-[12px] text-[#64748B]">{fullyCertified}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#F4AC1E]" />
          <span className="text-[13px] font-semibold text-[#0F172A]">Expiring soon</span>
          <span className="text-[12px] text-[#64748B]">{expiringSoon}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#022C51]" />
          <span className="text-[13px] font-semibold text-[#0F172A]">Not currently certified</span>
          <span className="text-[12px] text-[#64748B]">{notCertified}</span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ChampionDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'champion') redirect('/super-admin')

  const data = await getChampionDashboardData()
  const qprPct = data.qpr.total > 0 ? Math.round((data.qpr.certified / data.qpr.total) * 100) : 0

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="rounded-2xl bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(13,130,117,0.1)] px-2.5 py-0.5 text-[11px] font-semibold text-[#0D8275]">
            <span className="h-2 w-2 rounded-full bg-[#0D8275]" />
            {data.clubName || 'Your Club'}
          </span>
        </div>
        <h1 className="mt-[10px] font-[family-name:var(--font-inter)] text-2xl font-extrabold tracking-[-0.6px] text-[#0F172A]">
          Welcome, {profile.full_name}
        </h1>
        <p className="mt-2 font-[family-name:var(--font-inter)] text-[13px] text-[#475569]">
          A center-level view of your club&apos;s Gatekeeper roster, QPR certification progress, and upcoming events.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Active Gatekeepers"
          value={String(data.activeGatekeepers)}
          caption="Currently active in your club"
          iconSrc="/icons/kpi-gatekeepers.svg"
        />
        <KpiTile
          label="Inactive Gatekeepers"
          value={String(data.inactiveGatekeepers)}
          caption="Deactivated in your club"
          iconSrc="/icons/kpi-gatekeepers.svg"
        />
        <KpiTile
          label="New This Month"
          value={String(data.newGatekeepersThisMonth)}
          caption="Gatekeepers onboarded this month"
          captionTone="positive"
          iconSrc="/icons/kpi-events.svg"
        />
        <KpiTile
          label="QPR Certified"
          value={`${qprPct}%`}
          caption={`${data.qpr.certified} of ${data.qpr.total} Gatekeepers & Champions`}
          iconSrc="/icons/kpi-qpr.svg"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">Gatekeepers Overview</h2>
          <p className="mt-1 text-[11px] text-[#64748B]">Active vs. inactive Gatekeepers at a glance</p>
          <div className="mt-5 flex justify-center">
            <ActiveInactiveDonut active={data.activeGatekeepers} inactive={data.inactiveGatekeepers} />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6">
          <h2 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-[#0F172A]">QPR Certification Status</h2>
          <p className="mt-1 text-[11px] text-[#64748B]">Certification progress across your club</p>
          <div className="mt-5">
            <QprCertificationBar certified={data.qpr.certified} expiringSoon={data.qpr.expiringSoon} total={data.qpr.total} />
          </div>
        </div>
      </div>

      {data.clubId && <CertificationFiguresCard scope={{ kind: 'club', clubId: data.clubId }} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MonthlyTrendWidget data={data.monthlyTrend} />
        <OnboardingStatusWidget data={data.notYetLoggedIn} />
      </div>

      <ClubEventsSummary upcoming={data.upcomingEvents} completed={data.recentlyCompleted} />
    </div>
  )
}
