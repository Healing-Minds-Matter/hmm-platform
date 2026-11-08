// Resource categories are managed data (sheet row 26): Super Admins create,
// rename and deactivate them under Resources > Categories. The list lives in
// public.resource_categories (migration 20261110000000), not in code.
//
// Categories describe the topic, not the format: the resource *type*
// (Video/Article/Document/Other) is chosen separately.

export type ResourceCategory = { id: string; name: string; is_active: boolean }

export const CATEGORY_NAME_MAX = 80

/** The options for a resource's category drop-down: active categories, plus the
 *  resource's current one if it has since been deactivated (so editing other
 *  fields doesn't silently drop it). */
export function categoryOptions(all: ResourceCategory[], currentId?: string | null): ResourceCategory[] {
  return all.filter(c => c.is_active || c.id === currentId)
}

/**
 * Checks a category chosen on Create/Edit Resource. A new or changed choice
 * must be an active category; an unchanged one may stay even if it has been
 * deactivated since. The database enforces the same rule.
 */
export function checkCategoryChoice(
  chosenId: string | null,
  all: ResourceCategory[],
  previousId: string | null = null,
): { ok: true } | { ok: false; error: string } {
  if (!chosenId) return { ok: false, error: 'Choose a category.' }
  const cat = all.find(c => c.id === chosenId)
  if (!cat) return { ok: false, error: 'Choose a category from the list.' }
  if (!cat.is_active && chosenId !== previousId) {
    return { ok: false, error: `The category "${cat.name}" has been deactivated. Choose an active category.` }
  }
  return { ok: true }
}

/** Validates a category name for create/rename. */
export function checkCategoryName(raw: string | null | undefined, all: ResourceCategory[], selfId?: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name) return { ok: false, error: 'Category name is required.' }
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: `Category name must be ${CATEGORY_NAME_MAX} characters or fewer.` }
  const clash = all.find(c => c.id !== selfId && c.name.trim().toLowerCase() === name.toLowerCase())
  if (clash) return { ok: false, error: `A category called "${clash.name}" already exists.` }
  return { ok: true, name }
}
