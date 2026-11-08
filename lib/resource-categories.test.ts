import { describe, expect, it } from 'vitest'
import { categoryOptions, checkCategoryChoice, checkCategoryName, type ResourceCategory } from '@/lib/resource-categories'

// Sheet row 26: categories are managed data.
const cats: ResourceCategory[] = [
  { id: 'a', name: 'Guides & Protocols', is_active: true },
  { id: 'b', name: 'Facilitator Kits', is_active: true },
  { id: 'old', name: 'Training', is_active: false },
]

describe('categoryOptions', () => {
  it('lists active categories only', () => {
    expect(categoryOptions(cats).map(c => c.id)).toEqual(['a', 'b'])
  })
  it("keeps a resource's own deactivated category on edit", () => {
    expect(categoryOptions(cats, 'old').map(c => c.id)).toEqual(['a', 'b', 'old'])
  })
})

describe('checkCategoryChoice', () => {
  it('accepts an active category', () => {
    expect(checkCategoryChoice('a', cats)).toEqual({ ok: true })
  })
  it('refuses a missing, unknown or newly chosen inactive category', () => {
    expect(checkCategoryChoice(null, cats)).toEqual({ ok: false, error: 'Choose a category.' })
    expect(checkCategoryChoice('zzz', cats)).toEqual({ ok: false, error: 'Choose a category from the list.' })
    expect(checkCategoryChoice('old', cats)).toEqual({ ok: false, error: 'The category "Training" has been deactivated. Choose an active category.' })
    expect(checkCategoryChoice('old', cats, 'a').ok).toBe(false)
  })
  it('lets an unchanged deactivated category stay', () => {
    expect(checkCategoryChoice('old', cats, 'old')).toEqual({ ok: true })
  })
})

describe('checkCategoryName', () => {
  it('trims and collapses spaces', () => {
    expect(checkCategoryName('  Crisis   Support ', cats)).toEqual({ ok: true, name: 'Crisis Support' })
  })
  it('requires a name of at most 80 characters', () => {
    expect(checkCategoryName('  ', cats)).toEqual({ ok: false, error: 'Category name is required.' })
    expect(checkCategoryName('x'.repeat(81), cats).ok).toBe(false)
  })
  it('refuses a duplicate regardless of capitals, but allows renaming to itself', () => {
    expect(checkCategoryName('facilitator kits', cats)).toEqual({ ok: false, error: 'A category called "Facilitator Kits" already exists.' })
    expect(checkCategoryName('Facilitator kits', cats, 'b')).toEqual({ ok: true, name: 'Facilitator kits' })
  })
})
