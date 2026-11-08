// Role & Access on the profile pages (sheet row 62): the user's effective
// permissions, grouped by the same categories and labels as the Permissions
// screens. The list itself comes from my_access_list() (migration 20261110000003).

export type AccessRow = { key: string; label: string; category: string; display_order: number }
export type AccessGroup = { category: string; title: string; items: { key: string; label: string }[] }

// The stored category text for event permissions. It still names QPR because the
// live site matches on it; screens show CATEGORY_DISPLAY_TITLES' title instead.
export const EVENTS_CATEGORY = 'Events & QPR Training Sessions'

export const CATEGORY_DISPLAY_TITLES: Record<string, string> = {
  [EVENTS_CATEGORY]: 'Events & Certification Programmes',
}

export function permissionCategoryTitle(category: string): string {
  return CATEGORY_DISPLAY_TITLES[category] ?? category
}

/** Groups by category (in first-seen order), each in display order, each key once. */
export function groupAccessList(rows: AccessRow[]): AccessGroup[] {
  const groups = new Map<string, AccessGroup>()
  const seen = new Set<string>()
  const sorted = [...rows].sort((a, b) =>
    a.category.localeCompare(b.category) || a.display_order - b.display_order || a.label.localeCompare(b.label))
  for (const r of sorted) {
    if (seen.has(r.key)) continue
    seen.add(r.key)
    let g = groups.get(r.category)
    if (!g) { g = { category: r.category, title: permissionCategoryTitle(r.category), items: [] }; groups.set(r.category, g) }
    g.items.push({ key: r.key, label: r.label })
  }
  return [...groups.values()]
}
