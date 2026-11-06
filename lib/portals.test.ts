import { describe, expect, it } from 'vitest'
import { loginPathFor } from '@/lib/portals'

// Sheet row 58: every redirect to login goes to the user's own portal.
describe('loginPathFor', () => {
  it('uses the role when known', () => {
    expect(loginPathFor({ role: 'champion', pathname: '/super-admin' })).toBe('/champion/login')
    expect(loginPathFor({ role: 'super_admin', hint: 'champion' })).toBe('/login')
  })
  it('uses the path when signed out', () => {
    expect(loginPathFor({ pathname: '/champion/events' })).toBe('/champion/login')
    expect(loginPathFor({ pathname: '/champion' })).toBe('/champion/login')
    expect(loginPathFor({ pathname: '/super-admin/clubs', hint: 'champion' })).toBe('/login')
    expect(loginPathFor({ pathname: '/championship' })).toBe('/login')
  })
  it('falls back to the portal this browser last signed in through', () => {
    expect(loginPathFor({ pathname: '/', hint: 'champion' })).toBe('/champion/login')
    expect(loginPathFor({ pathname: '/set-password', hint: 'super_admin' })).toBe('/login')
    expect(loginPathFor({})).toBe('/login')
  })
})
