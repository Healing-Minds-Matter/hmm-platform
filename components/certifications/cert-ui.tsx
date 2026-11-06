// Small building blocks for the Certifications screens (Epic 10), in the
// portal's existing styles: page header, sub-nav pills, status badge, cards.
import Link from 'next/link'
import { typeStatusBadge, type CertificationTypeRow } from '@/lib/certification-types'

export function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#475569]">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F4AC1E] px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F]"
    >
      {children}
    </Link>
  )
}

export function SecondaryLink({ href, children, danger = false }: { href: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center rounded-lg border px-4 text-[13px] font-semibold transition-colors ${
        danger ? 'border-[#FCA5A5] bg-white text-[#DC2626] hover:bg-[#FEF2F2]' : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
      }`}
    >
      {children}
    </Link>
  )
}

// `reviews`: how many self-reported certifications are waiting, or null to hide the tab.
export function CertTabs({ current, base, showAudit, reviews = null }: {
  current: 'types' | 'reviews' | 'audit'; base: string; showAudit: boolean; reviews?: number | null
}) {
  const tabs: { key: string; label: React.ReactNode; href: string }[] = [
    { key: 'types', label: 'Certification types', href: base },
    ...(reviews !== null ? [{
      key: 'reviews',
      label: <>Reviews{reviews > 0 && <span className="ml-1.5 rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-bold text-white">{reviews}</span>}</>,
      href: `${base}/reviews`,
    }] : []),
    ...(showAudit ? [{ key: 'audit', label: 'Audit history', href: `${base}/audit` }] : []),
  ]
  return (
    <nav aria-label="Certifications" className="flex flex-wrap items-center gap-1 self-start rounded-lg bg-[#F1F5F9] p-1">
      {tabs.map(t => {
        const active = t.key === current
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-[5px] px-4 py-1.5 text-[12px] font-semibold tracking-[0.24px] transition-colors ${
              active ? 'bg-[#022C51] text-white shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

const TONE = {
  ok: { badge: 'bg-[#E6FFE7] text-[#0D8275]', dot: 'bg-[#10B981]' },
  warn: { badge: 'bg-[#D97706]/10 text-[#D97706]', dot: 'bg-[#D97706]' },
  bad: { badge: 'bg-[#FEF2F2] text-[#DC2626]', dot: 'bg-[#DC2626]' },
  info: { badge: 'bg-[#EFF6FF] text-[#265BA2]', dot: 'bg-[#265BA2]' },
  grey: { badge: 'bg-[#F1F5F9] text-[#64748B]', dot: 'bg-[#94A3B8]' },
} as const
export type Tone = keyof typeof TONE

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone].badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  )
}

export function TypeStatusBadge({ type }: { type: Pick<CertificationTypeRow, 'status' | 'retire_on' | 'returns_on'> }) {
  const b = typeStatusBadge(type)
  return <Badge tone={b.tone}>{b.label}</Badge>
}

export function Code({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] font-bold text-[#003495]">{children}</span>
}

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-[#0F172A]">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-4 gap-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="pt-0.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">{label}</dt>
          <dd className="text-sm text-[#0F172A]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// Pop-up card used by the create/edit/retire/reactivate forms (same as the
// Add Gatekeeper and Create Club modals).
export function FormCard({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-6 text-[#0F172A]">{title}</h1>
          <p className="max-w-[480px] text-[12px] leading-4 text-[#64748B]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>
      {children}
    </div>
  )
}

export const INPUT =
  'h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8] read-only:bg-[#F1F5F9] read-only:text-[#64748B] disabled:opacity-60'
export const LABEL = 'mb-1.5 block text-[13px] font-medium text-[#0F172A]'
export const HINT = 'mt-1.5 text-[11px] text-[#64748B]'
export const SECTION = 'flex flex-col gap-4 rounded-xl bg-white p-5'
export const SECTION_TITLE = 'border-b border-[#E2E8F0] pb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B]'
export const CANCEL_BTN = 'flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]'
export const PRIMARY_BTN = 'flex h-10 items-center gap-2 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60'
export const DANGER_BTN = 'flex h-10 items-center gap-2 rounded-lg bg-[#DC2626] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-60'
export const OPTION = 'flex cursor-pointer items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-[13px] font-medium text-[#0F172A] has-[:checked]:border-[#022C51] has-[:checked]:bg-[#F8FAFC] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50'
