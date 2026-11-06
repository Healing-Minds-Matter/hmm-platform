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

  return (
    <div className="flex flex-col gap-5 p-6">

      <ExecutiveBanner activeClubCount={data.activeGatekeepersPerClub.length} />

      {/* ── Row 1: Total Champions (4) · Upcoming Events (8). Certification figures are in the per-type table below. ── */}
      <div className="grid grid-cols-12 gap-5">

        {/* Total Champions */}
        <div className="col-span-4 flex flex-col rounded-2xl bg-white p-5">
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
        <div className="col-span-8">
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
