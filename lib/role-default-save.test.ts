import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/actions/permissions', () => ({ updateRoleDefaultAction: vi.fn() }))

import { OFFLINE_MESSAGE, saveRoleDefault } from '@/lib/role-default-save'
import { RoleDefaultToggle } from '@/app/(dashboard)/super-admin/permissions/role-default-toggle'

// Fix L: a failed save must flip the switch back and say why; every switch
// needs an accessible name so screen readers say which permission it is.

describe('saveRoleDefault', () => {
  const fd = new FormData()

  it('saved → null (switch stays as set)', async () => {
    expect(await saveRoleDefault(async () => null, fd)).toBeNull()
  })
  it('server says no → its message (switch flips back)', async () => {
    expect(await saveRoleDefault(async () => ({ error: 'Couldn’t save the change.' }), fd)).toBe('Couldn’t save the change.')
  })
  it('request throws (offline / server down) → the connection message', async () => {
    expect(await saveRoleDefault(async () => { throw new TypeError('Failed to fetch') }, fd)).toBe(OFFLINE_MESSAGE)
  })
  it('sends the form it was given', async () => {
    const send = vi.fn(async () => null)
    await saveRoleDefault(send, fd)
    expect(send).toHaveBeenCalledWith(fd)
  })
})

describe('RoleDefaultToggle', () => {
  const render = (initialEnabled: boolean) =>
    renderToStaticMarkup(createElement(RoleDefaultToggle, { role: 'gatekeeper', permission: 'view_event_calendar', label: 'View Event Calendar', initialEnabled }))

  it('is a switch named after its permission', () => {
    const html = render(true)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-label="View Event Calendar"')
    expect(html).toContain('aria-checked="true"')
  })
  it('shows off when off, with no error yet', () => {
    const html = render(false)
    expect(html).toContain('aria-checked="false"')
    expect(html).not.toContain('role="alert"')
  })
})
