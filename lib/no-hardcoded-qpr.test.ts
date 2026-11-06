// No certification type is special-cased (decided with the user 2026-11-06):
// QPR is an ordinary certification type, so the web app's code must not name it.
// The only allowed mentions are stored values the live site and mobile app still
// match on (see supabase/migrations/20261109000000_remove_hardcoded_qpr.sql):
// the event type value 'qpr_session', the permission category text and the old
// qpr_certification_stats function. Test files may use QPR as sample data.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app', 'components', 'lib', 'actions']
const ALLOWED = [
  /qpr_session/,                                   // stored event type value
  /EVENTS_CATEGORY = 'Events & QPR Training Sessions'/, // stored permission category
  /It still names QPR because the/,                // the comment explaining it
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('no hard-coded QPR in the web app', () => {
  it('names QPR only in the stored values the live site still matches on', () => {
    const offending = ROOTS.flatMap(sourceFiles).flatMap(path =>
      readFileSync(path, 'utf8').split('\n')
        .map((line, i) => ({ path, line: i + 1, text: line.trim() }))
        .filter(l => /qpr/i.test(l.text) && !ALLOWED.some(re => re.test(l.text))),
    )
    expect(offending).toEqual([])
  })

  it('shows the certification programme event type without QPR', async () => {
    const { EVENT_TYPE_OPTIONS, CERTIFICATION_PROGRAMME_EVENT } = await import('@/app/(dashboard)/super-admin/events/event-type')
    expect(EVENT_TYPE_OPTIONS.find(o => o.value === CERTIFICATION_PROGRAMME_EVENT)?.label).toBe('Certification Programme')
    expect(EVENT_TYPE_OPTIONS.map(o => o.label).join(' ')).not.toMatch(/qpr/i)
  })
})
