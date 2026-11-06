// The fixed list of resource categories, shown as a drop-down on Create and
// Edit Resource. A fixed list (rather than free text) keeps the "filter by
// category" feature clean for Champions (web) and Gatekeepers (mobile) — free
// text split one category into "Training" / "training" / "Trainings".
//
// Categories describe the topic, not the format: the resource *type*
// (Video/Article/Document/Other) is chosen separately.
//
// To add, rename or remove a category, change this list. Renaming one also
// needs the existing resources' `category` values updated to match, or
// they'll show up as an older category (see isAllowedCategory below).
export const RESOURCE_CATEGORIES = [
  'Certification Training',
  'Warning Signs & Risk Awareness',
  'Crisis Support & Referral',
  'Guides & Protocols',
  'Facilitator Kits',
  'Awareness Programmes',
  'Self-Care & Wellbeing',
  'Mental Health Basics',
  'Club & Programme Admin',
  'Other',
] as const

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export function isResourceCategory(value: string | null | undefined): value is ResourceCategory {
  return !!value && (RESOURCE_CATEGORIES as readonly string[]).includes(value)
}

// A resource saved before this list existed may still carry an older
// category (e.g. "Training"). It may keep that value as long as it's left
// unchanged on edit; any new or changed category must come from the list.
export function isAllowedCategory(value: string | null, previous: string | null): boolean {
  return isResourceCategory(value) || (!!value && value === previous)
}
