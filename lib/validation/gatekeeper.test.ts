import { describe, expect, it } from 'vitest'
import { parseNewGatekeeper } from '@/lib/validation/gatekeeper'

// Review Finding 13j: the shared schema for a new Gatekeeper.
const ok = { full_name: '  Asha   Perera ', email: ' Asha@Example.COM ', phone: '077 123 4567', club_id: '11111111-1111-4111-8111-111111111111', preferred_language: '' }

describe('parseNewGatekeeper', () => {
  it('cleans and normalises a good row', () => {
    expect(parseNewGatekeeper(ok)).toEqual({ ok: true, value: {
      full_name: 'Asha Perera', email: 'asha@example.com', phone: '+94771234567',
      club_id: '11111111-1111-4111-8111-111111111111', preferred_language: 'en',
    } })
  })
  it('club_id may be empty (a Champion’s own club is used)', () => {
    expect(parseNewGatekeeper({ ...ok, club_id: '' })).toMatchObject({ ok: true, value: { club_id: null } })
  })
  it.each([
    ['full_name', { full_name: '' }],
    ['full_name', { full_name: '12345' }],
    ['full_name', { full_name: '=HYPERLINK("x")' }],
    ['email', { email: 'a@b' }],
    ['email', { email: `${'a'.repeat(250)}@example.com` }],
    ['phone', { phone: '+1' }],
    ['club_id', { club_id: "1' OR '1'='1" }],
    ['preferred_language', { preferred_language: 'de' }],
  ])('rejects bad %s', (field, over) => {
    expect(parseNewGatekeeper({ ...ok, ...over })).toMatchObject({ ok: false, field })
  })
  it('ignores anything else sent (role, is_active …)', () => {
    const r = parseNewGatekeeper({ ...ok, ...({ role: 'super_admin' } as object) })
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['club_id', 'email', 'full_name', 'phone', 'preferred_language'])
  })
})
