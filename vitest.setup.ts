// Unit tests never reach the internet: the leaked-password check (Fix 3)
// gets an empty answer ("not leaked") unless a test passes its own fetch.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('https://api.pwnedpasswords.com/')) return new Response('', { status: 200 })
  return realFetch(input, init)
}) as typeof fetch
