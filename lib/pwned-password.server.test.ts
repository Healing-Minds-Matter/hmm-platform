import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { isPwnedPassword } from '@/lib/pwned-password.server'

const PASSWORD = 'Galle-Fort-Lamp-73!'
const sha1 = createHash('sha1').update(PASSWORD).digest('hex').toUpperCase()

function rangeReply(lines: string[], status = 200) {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => new Response(lines.join('\r\n'), { status }))
}

describe('Fix 3: leaked-password check (Have I Been Pwned range API)', () => {
  it('sends only the first 5 characters of the SHA-1 hash, with padding', async () => {
    const fetchImpl = rangeReply(['0000000000000000000000000000000000A:1'])
    await isPwnedPassword(PASSWORD, fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`)
    expect(String(url)).not.toContain(sha1.slice(5))
    expect(JSON.stringify(init)).not.toContain(PASSWORD)
    expect((init?.headers as Record<string, string>)['Add-Padding']).toBe('true')
  })

  it('a password in the list → true', async () => {
    const fetchImpl = rangeReply(['0000000000000000000000000000000000A:3', `${sha1.slice(5)}:42`])
    expect(await isPwnedPassword(PASSWORD, fetchImpl as unknown as typeof fetch)).toBe(true)
  })

  it('a password not in the list → false', async () => {
    const fetchImpl = rangeReply(['0000000000000000000000000000000000A:3'])
    expect(await isPwnedPassword(PASSWORD, fetchImpl as unknown as typeof fetch)).toBe(false)
  })

  it('a padding line (count 0) is not a match', async () => {
    const fetchImpl = rangeReply([`${sha1.slice(5)}:0`])
    expect(await isPwnedPassword(PASSWORD, fetchImpl as unknown as typeof fetch)).toBe(false)
  })

  it('service down or unreachable → the password is allowed', async () => {
    expect(await isPwnedPassword(PASSWORD, rangeReply([], 503) as unknown as typeof fetch)).toBe(false)
    const failing = vi.fn(async () => { throw new Error('offline') })
    expect(await isPwnedPassword(PASSWORD, failing as unknown as typeof fetch)).toBe(false)
  })
})
