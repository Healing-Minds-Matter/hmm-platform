// The one place event-type labels and colours are defined; every screen
// (calendars, filters, Club/Champion detail, dashboard widget) reads from here.
//
// The stored value for certification programmes is still 'qpr_session': it is a
// database enum value the live site and the mobile app read and write, so it is
// kept as-is and only its label is shown. "Other" is a neutral grey fallback.
export const EVENT_TYPE_STYLES: Record<string, { label: string; dot: string; pillBg: string; pillText: string; badge: string }> = {
  qpr_session:       { label: 'Certification Programme',      dot: '#1E4BB8', pillBg: '#EFF4FF',                pillText: '#1E4BB8', badge: 'bg-[#EFF4FF] text-[#1E4BB8]' },
  awareness_program: { label: 'Awareness Program',            dot: '#EAA824', pillBg: 'rgba(255,222,172,0.5)',  pillText: '#7E5700', badge: 'bg-[rgba(255,222,172,0.5)] text-[#7E5700]' },
  workshop:           { label: 'Clinical & Skills Workshop',   dot: '#0D8275', pillBg: 'rgba(148,244,227,0.4)',  pillText: '#00453E', badge: 'bg-[rgba(148,244,227,0.4)] text-[#00453E]' },
  other:              { label: 'Other',                        dot: '#94A3B8', pillBg: '#F1F5F9',                pillText: '#475569', badge: 'bg-[#F1F5F9] text-[#475569]' },
}

// The stored value of the certification programme event type (see above).
export const CERTIFICATION_PROGRAMME_EVENT = 'qpr_session'

export const EVENT_TYPE_OPTIONS: { value: string; label: string }[] =
  Object.entries(EVENT_TYPE_STYLES).map(([value, s]) => ({ value, label: s.label }))

export function eventTypeStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? EVENT_TYPE_STYLES.other
}

// The label to show for an event's type: for "Other", the description typed
// when it was scheduled (sheet row 43); older "Other" events without one say "Other".
export function eventTypeLabel(type: string, typeDescription?: string | null): string {
  if (type === 'other' && typeDescription?.trim()) return typeDescription.trim()
  return eventTypeStyle(type).label
}
