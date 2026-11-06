// Granting individual exceptions for several permissions at once (sheet row 60).
// Pure planning step, shared by the server action and its tests.

export type CatalogEntry = { key: string; label: string; restricted_to: string | null }
export type Effective = { permission: string; is_enabled: boolean }

export type GrantPlan = {
  toSave: { key: string; label: string }[]
  /** Already the chosen setting for this person — nothing to do. */
  skipped: { key: string; label: string; reason: string }[]
  /** Never grantable (Super Admins only) or unknown. */
  refused: { key: string; label: string; reason: string }[]
}

export function planExceptionGrant(
  keys: string[],
  isEnabled: boolean,
  catalog: CatalogEntry[],
  effective: Effective[],
): GrantPlan {
  const byKey = new Map(catalog.map(c => [c.key, c]))
  const current = new Map(effective.map(e => [e.permission, e.is_enabled]))
  const plan: GrantPlan = { toSave: [], skipped: [], refused: [] }
  for (const key of [...new Set(keys.map(k => k.trim()).filter(Boolean))]) {
    const entry = byKey.get(key)
    if (!entry) { plan.refused.push({ key, label: key, reason: 'not a known permission' }); continue }
    if (isEnabled && entry.restricted_to === 'super_admin') {
      plan.refused.push({ key, label: entry.label, reason: 'for Super Admins only — it can never be granted to anyone else' })
      continue
    }
    if ((current.get(key) ?? false) === isEnabled) {
      plan.skipped.push({ key, label: entry.label, reason: isEnabled ? 'they already have it' : 'they already don’t have it' })
      continue
    }
    plan.toSave.push({ key, label: entry.label })
  }
  return plan
}

/** One plain-English summary line per outcome group. */
export function describeGrantPlan(plan: GrantPlan, isEnabled: boolean): string[] {
  const list = (xs: { label: string }[]) => xs.map(x => `“${x.label}”`).join(', ')
  const lines: string[] = []
  if (plan.toSave.length) lines.push(`${isEnabled ? 'Allowed' : 'Denied'}: ${list(plan.toSave)}.`)
  if (plan.skipped.length) lines.push(`Skipped (${isEnabled ? 'already allowed' : 'already denied'}): ${list(plan.skipped)}.`)
  if (plan.refused.length) lines.push(`Refused: ${plan.refused.map(r => `“${r.label}” (${r.reason})`).join(', ')}.`)
  return lines
}
