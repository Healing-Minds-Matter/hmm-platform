// Review Finding 2: a Gatekeeper's mood check-ins are private to them. The web
// portals (Super Admin, Champion) have no route to them: no page, action or
// helper may touch the mood_checkins table, whether with the caller's client
// or the service-role key. The database side (only the Gatekeeper's own rows,
// no function or view that reads the table) is covered by the RLS tests.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app', 'components', 'lib', 'actions', 'hooks']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('no web route to mood check-ins', () => {
  it('no web code reads or writes mood_checkins', () => {
    const files = [...ROOTS.flatMap(sourceFiles), 'middleware.ts']
    const offending = files.filter(path => /mood_checkins|mood-checkins|moodCheckins/i.test(readFileSync(path, 'utf8')))
    expect(offending).toEqual([])
  })
})
