import { describe, expect, it } from 'vitest'
import { groupAccessList, permissionCategoryTitle } from '@/lib/access-list'

// Sheet row 62: the profile Role & Access list is generated from the user's
// effective permissions (my_access_list), grouped like the Permissions screens.
describe('groupAccessList', () => {
  const rows = [
    { key: 'view_event_calendar', label: 'View Event Calendar', category: 'Events & QPR Training Sessions', display_order: 13 },
    { key: 'download_facilitator_kits', label: 'Download Gatekeeper Facilitator Kits', category: 'Learning Resources & Library', display_order: 10 },
    { key: 'schedule_qpr_sessions', label: 'Schedule Certification Programme Sessions', category: 'Events & QPR Training Sessions', display_order: 5 },
    { key: 'schedule_qpr_sessions', label: 'Schedule Certification Programme Sessions', category: 'Events & QPR Training Sessions', display_order: 5 },
  ]

  it('groups by category with the display titles, in display order, each once', () => {
    expect(groupAccessList(rows)).toEqual([
      { category: 'Events & QPR Training Sessions', title: 'Events & Certification Programmes', items: [
        { key: 'schedule_qpr_sessions', label: 'Schedule Certification Programme Sessions' },
        { key: 'view_event_calendar', label: 'View Event Calendar' },
      ] },
      { category: 'Learning Resources & Library', title: 'Learning Resources & Library', items: [
        { key: 'download_facilitator_kits', label: 'Download Gatekeeper Facilitator Kits' },
      ] },
    ])
  })

  it('never shows QPR in a category title', () => {
    expect(permissionCategoryTitle('Events & QPR Training Sessions')).not.toMatch(/QPR/)
  })

  it('is empty when the user has nothing', () => {
    expect(groupAccessList([])).toEqual([])
  })
})
