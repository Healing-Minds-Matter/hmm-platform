// One certification status per person, for badges in lists and detail pages.
// It covers every certification type (nothing is special-cased): see
// personCertStatus in lib/cert-summary.ts for how it is worked out.
export type PersonCertStatus = 'certified' | 'expiring_soon' | 'expired' | 'none' | 'inactive'

export const PERSON_CERT_STATUS_LABEL: Record<PersonCertStatus, string> = {
  certified: 'Certified',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  none: 'No certifications',
  inactive: 'Inactive',
}

export const PERSON_CERT_STATUS_BADGE: Record<PersonCertStatus, string> = {
  certified: 'bg-[#E6FFE7] text-[#0D8275]',
  expiring_soon: 'bg-[#D97706]/10 text-[#B45309]',
  expired: 'bg-[#FEF2F2] text-[#DC2626]',
  none: 'bg-[#EFF6FF] text-[#265BA2]',
  inactive: 'bg-[#F1F5F9] text-[#64748B]',
}

export const PERSON_CERT_STATUS_DOT: Record<PersonCertStatus, string> = {
  certified: 'bg-[#10B981]',
  expiring_soon: 'bg-[#D97706]',
  expired: 'bg-[#DC2626]',
  none: 'bg-[#265BA2]',
  inactive: 'bg-[#94A3B8]',
}
