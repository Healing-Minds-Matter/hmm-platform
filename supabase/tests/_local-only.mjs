// Import FIRST in database test scripts that must never touch the hosted
// (live) project. Exits unless .env.local points at a local Supabase.
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(`${process.cwd()}/.env.local`, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a local Supabase (127.0.0.1 / localhost).')
  process.exit(2)
}
