import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sheet row 32: certification type form errors come back tied to the field
// they are about, so each form can show them next to the input.
const db = vi.hoisted(() => ({
  insertError: null as { code: string; message: string } | null,
  type: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { role: 'super_admin' } }),
          maybeSingle: async () => ({ data: table === 'certification_type_statuses' ? db.type : null }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: db.insertError ? null : { id: 'new-type' }, error: db.insertError }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/certifications.server', () => ({ typeIssuedFacts: vi.fn(async () => ({ certificates: 0, people: 0, latestAchievedOn: null })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))

import { createTypeAction, reactivateTypeAction, retireTypeAction } from '@/actions/certification-types'

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const valid = {
  name: 'Psychological First Aid', code: 'PFA', validity_kind: 'fixed', validity_value: '2', validity_unit: 'years',
  offered_from: '2025-01-01', offered_until: '',
}

beforeEach(() => {
  db.insertError = null
  db.type = { id: 't1', status: 'retired', open_retirement_id: 'r1' }
})

describe('createTypeAction: field-level errors', () => {
  it('ties required and format errors to their field', async () => {
    expect((await createTypeAction(null, form({ ...valid, name: '' })))?.fieldErrors).toEqual({ name: 'Enter a name.' })
    expect((await createTypeAction(null, form({ ...valid, code: 'P F' })))?.fieldErrors)
      .toEqual({ code: 'The code can only use letters, numbers and hyphens.' })
    expect((await createTypeAction(null, form({ ...valid, offered_until: '2024-12-31' })))?.fieldErrors)
      .toEqual({ offered_until: 'Offered until must be on or after Offered from.' })
  })

  it('ties an already-used code to the code field, and keeps what was typed', async () => {
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "certification_types_code_key"' }
    const state = await createTypeAction(null, form(valid))
    expect(state?.fieldErrors).toEqual({ code: 'The code “PFA” is already used by another type.' })
    expect(state?.values?.name).toBe('Psychological First Aid')
  })
})

describe('retire and reactivate: field-level errors', () => {
  it('ties the option and date errors to their field', async () => {
    expect((await retireTypeAction(null, form({ type_id: 't1', retire_on: '2030-01-01', option: '' })))?.fieldErrors)
      .toEqual({ option: 'Choose what happens to existing certificates.' })
    db.type = { id: 't1', status: 'active', open_retirement_id: null }
    expect((await retireTypeAction(null, form({ type_id: 't1', retire_on: '', option: 'keep' })))?.fieldErrors)
      .toEqual({ retire_on: 'Enter the retirement date.' })
    db.type = { id: 't1', status: 'retired', open_retirement_id: 'r1' }
    expect((await reactivateTypeAction(null, form({ type_id: 't1', from: '' })))?.fieldErrors)
      .toEqual({ from: 'Enter the date it’s offered again from.' })
  })

  it('keeps errors not about a field at the top of the form', async () => {
    db.type = null
    expect(await reactivateTypeAction(null, form({ type_id: 't1', from: '2030-01-01' })))
      .toEqual({ error: 'This certification type no longer exists.', values: { from: '2030-01-01' } })
  })
})
