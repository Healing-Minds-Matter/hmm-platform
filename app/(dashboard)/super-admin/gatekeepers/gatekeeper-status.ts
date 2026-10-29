// Same certified/expiring-soon convention used across the app (Club detail,
// Champion detail, Dashboard QPR widget): expiring soon = certified AND
// expiry within 90 days. No certification date at all = not certified yet
// (members can be added before they're certified), not "expired".
export type QprStatus = 'active' | 'expiring_soon' | 'expired' | 'not_certified' | 'inactive'

export function qprStatus(isActive: boolean, qprExpiryDate: string | null, today: string, in90Days: string): QprStatus {
  if (!isActive) return 'inactive'
  if (!qprExpiryDate) return 'not_certified'
  if (qprExpiryDate < today) return 'expired'
  if (qprExpiryDate <= in90Days) return 'expiring_soon'
  return 'active'
}

export const QPR_STATUS_LABEL: Record<QprStatus, string> = {
  active: 'Active',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  not_certified: 'Not Certified',
  inactive: 'Inactive',
}

export const QPR_STATUS_BADGE: Record<QprStatus, string> = {
  active: 'bg-[#E6FFE7] text-[#0D8275]',
  expiring_soon: 'bg-[#D97706]/10 text-[#D97706]',
  expired: 'bg-[#FEF2F2] text-[#DC2626]',
  not_certified: 'bg-[#EFF6FF] text-[#265BA2]',
  inactive: 'bg-[#F1F5F9] text-[#64748B]',
}

export const QPR_STATUS_DOT: Record<QprStatus, string> = {
  active: 'bg-[#10B981]',
  expiring_soon: 'bg-[#D97706]',
  expired: 'bg-[#DC2626]',
  not_certified: 'bg-[#265BA2]',
  inactive: 'bg-[#94A3B8]',
}

export function todayBounds() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return { today, in90Days }
}
