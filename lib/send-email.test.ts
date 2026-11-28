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

describe('sendTemporaryPasswordResetNotice (Fix B)', () => {
  async function send(role: string) {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('SENDGRID_API_KEY', 'test-key')
    const { sendTemporaryPasswordResetNotice } = await import('@/lib/send-email')
    const result = await sendTemporaryPasswordResetNotice({ to: 'zz@example.com', fullName: 'ZZ <Test>', role })
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body))
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    return { result, body, text: body.content[0].value as string, html: body.content[1].value as string }
  }

  it('tells the person to use Forgot password, with no link and no password', async () => {
    const { result, body, text, html } = await send('champion')
    expect(result).toEqual({})
    expect(body.personalizations[0].to[0].email).toBe('zz@example.com')
    expect(text).toContain('Forgot password?')
    expect(text).toContain('sign-in page')
    expect(html).not.toMatch(/href=|https?:/i)
    expect(text).not.toMatch(/https?:/i)
    expect(html).toContain('ZZ &lt;Test&gt;')
  })

  it('points Gatekeepers to the app', async () => {
    const { text } = await send('gatekeeper')
    expect(text).toContain('Gatekeeper app')
  })
})
