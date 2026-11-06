// The Super Admin and Champion dashboards show certification figures only per
// type (CertificationFiguresCard); there is no hard-coded QPR status widget.
// These pages are server components that need a database, so this guards the
// source instead of rendering them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const files = {
  superAdminPage: 'app/(dashboard)/super-admin/page.tsx',
  superAdminData: 'actions/dashboard.ts',
  championPage: 'app/(dashboard)/champion/page.tsx',
  championData: 'actions/champion-dashboard.ts',
}

describe('dashboards no longer show a QPR certification status', () => {
  it.each(Object.entries(files))('%s has no QPR figures, widgets or queries', (_name, path) => {
    const src = read(path)
    expect(src).not.toMatch(/qprData|QPRData|qprFigures|qprByHolder|QprRing|QprCertificationBar|kpi-qpr/)
    // The only mention allowed is the comment explaining there's no separate QPR status.
    const mentions = src.split('\n').filter(l => /qpr/i.test(l) && !/no separate QPR status/.test(l))
    expect(mentions).toEqual([])
  })
  it('both dashboards still show the per-type certifications table', () => {
    expect(read(files.superAdminPage)).toContain("<CertificationFiguresCard scope={{ kind: 'all' }} />")
    expect(read(files.championPage)).toContain("<CertificationFiguresCard scope={{ kind: 'club', clubId: data.clubId }} />")
  })
})
