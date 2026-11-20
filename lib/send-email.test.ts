// SendGrid failures are logged with SendGrid's own reason, never an address.
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { sendGridReason } from '@/lib/send-email'

describe('sendGridReason', () => {
  it('returns SendGrid’s error message', () => {
    expect(sendGridReason('{"errors":[{"message":"Maximum credits exceeded","field":null,"help":null}]}'))
      .toBe('Maximum credits exceeded')
  })

  it('joins several messages', () => {
    expect(sendGridReason('{"errors":[{"message":"a"},{"message":"b"}]}')).toBe('a; b')
  })

  it('removes email addresses', () => {
    expect(sendGridReason('{"errors":[{"message":"The from address jayani@ensiz.com does not match a verified Sender Identity"}]}'))
      .toBe('The from address [email] does not match a verified Sender Identity')
    expect(sendGridReason('bounced: <someone@example.org>')).toBe('bounced: <[email]>')
  })

  it('keeps non-JSON text, shortened', () => {
    expect(sendGridReason('Bad Gateway')).toBe('Bad Gateway')
    expect(sendGridReason('x'.repeat(1000))).toHaveLength(300)
  })
})
