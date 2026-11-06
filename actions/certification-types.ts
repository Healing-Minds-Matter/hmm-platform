'use server'

// Certification types (Epic 10, Stories 10.1 and 10.2). Every write uses the
// signed-in user's own client, so the database's rules (migrations
// 20261103000000 and 20261108000000: cert_can, triggers) decide what is allowed;
// the checks here only give a clearer message than a refused row.
//
// The programme period (Offered from / Offered until) is part of the type and only
// limits new awards. Retiring is a separate action (Retire type / Change retirement).

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { todayDateString } from '@/lib/org-date'
import { typeIssuedFacts } from '@/lib/certifications.server'
import type { FieldErrors } from '@/lib/form-errors'
import {
  TYPE_COLUMNS,
  describeTypeError,
  typeErrorField,
  validateReactivation,
  validateRetirement,
  validateTypeForm,
  type CertificationTypeRow,
  type TypeFormInput,
} from '@/lib/certification-types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// fieldErrors: errors tied to a form field, shown next to it (sheet row 32).
export type TypeFormState = { error?: string; fieldErrors?: FieldErrors; success?: boolean; id?: string; values?: TypeFormInput } | null
export type RetireFormState = { error?: string; fieldErrors?: FieldErrors; success?: boolean; values?: { retire_on: string; option: string } } | null
export type ReactivateFormState = { error?: string; fieldErrors?: FieldErrors; success?: boolean; values?: { from: string } } | null

/** `field` is the input the error belongs to; without one it shows at the top of the form. */
const withField = (error: string, field?: string | null) => ({ error, ...(field ? { fieldErrors: { [field]: error } } : {}) })

const str = (formData: FormData, key: string) => ((formData.get(key) as string | null) ?? '').trim()

function readTypeForm(formData: FormData): TypeFormInput {
  return {
    name: str(formData, 'name'),
    code: str(formData, 'code'),
    description: str(formData, 'description'),
    issuing_body: str(formData, 'issuing_body'),
    validity_kind: str(formData, 'validity_kind'),
    validity_value: str(formData, 'validity_value'),
    validity_unit: str(formData, 'validity_unit'),
    offered_from: str(formData, 'offered_from'),
    offered_until: str(formData, 'offered_until'),
  }
}

async function requireSuperAdmin(supabase: ServerClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return me?.role === 'super_admin' ? null : 'Only Super Admins can change certification types.'
}

async function loadType(supabase: ServerClient, id: string): Promise<CertificationTypeRow | null> {
  const { data } = await supabase.from('certification_type_statuses').select(TYPE_COLUMNS).eq('id', id).maybeSingle()
  return (data as CertificationTypeRow | null) ?? null
}

function revalidateTypes(id?: string) {
  revalidatePath('/super-admin/certifications')
  revalidatePath('/champion/certifications')
  if (id) revalidatePath(`/super-admin/certifications/${id}`)
}

// ── Create ───────────────────────────────────────────────────────────────────
export async function createTypeAction(_prev: TypeFormState, formData: FormData): Promise<TypeFormState> {
  const values = readTypeForm(formData)
  const fail = (error: string, field?: string | null): TypeFormState => ({ ...withField(error, field), values })
  const checked = validateTypeForm(values)
  if ('error' in checked) return fail(checked.error, checked.field)

  const supabase = await createClient()
  const denied = await requireSuperAdmin(supabase)
  if (denied) return fail(denied)

  const { data, error } = await supabase.from('certification_types').insert(checked.fields).select('id').single()
  if (error || !data) return fail(describeTypeError(error, checked.fields), typeErrorField(error))

  revalidateTypes(data.id)
  return { success: true, id: data.id }
}

// ── Edit ─────────────────────────────────────────────────────────────────────
// Once certificates exist, the code and Offered from can't change and Offered until
// can't be earlier than the latest date achieved (the database refuses it too).
// Issued certificates never change: they keep their dates, validity, number and PDF.
export async function updateTypeAction(_prev: TypeFormState, formData: FormData): Promise<TypeFormState> {
  const id = str(formData, 'id')
  const values = readTypeForm(formData)
  const fail = (error: string, field?: string | null): TypeFormState => ({ ...withField(error, field), values })

  const supabase = await createClient()
  const denied = await requireSuperAdmin(supabase)
  if (denied) return fail(denied)

  const current = await loadType(supabase, id)
  if (!current) return fail('This certification type no longer exists.')

  const issued = await typeIssuedFacts(supabase, id)
  const checked = validateTypeForm(values, { current, issued })
  if ('error' in checked) return fail(checked.error, checked.field)

  const { error } = await supabase.from('certification_types').update(checked.fields).eq('id', id)
  if (error) return fail(describeTypeError(error, checked.fields), typeErrorField(error))

  revalidateTypes(id)
  return { success: true, id }
}

// ── Retire / change retirement ───────────────────────────────────────────────
export async function retireTypeAction(_prev: RetireFormState, formData: FormData): Promise<RetireFormState> {
  const id = str(formData, 'type_id')
  const values = { retire_on: str(formData, 'retire_on'), option: str(formData, 'option') }
  const fail = (error: string, field?: 'retire_on' | 'option'): RetireFormState => ({ ...withField(error, field), values })
  if (values.option !== 'keep' && values.option !== 'stop') return fail('Choose what happens to existing certificates.', 'option')

  const supabase = await createClient()
  const denied = await requireSuperAdmin(supabase)
  if (denied) return fail(denied)

  const current = await loadType(supabase, id)
  if (!current) return fail('This certification type no longer exists.')
  const inEffect = current.status === 'retired'
  const dateErr = validateRetirement(values.retire_on, todayDateString(), { locked: inEffect })
  if (dateErr) return fail(dateErr, 'retire_on')

  const change = inEffect ? { option: values.option } : { retire_on: values.retire_on, option: values.option }
  const { error } = current.open_retirement_id
    ? await supabase.from('certification_type_retirements').update(change).eq('id', current.open_retirement_id)
    : await supabase.from('certification_type_retirements').insert({ type_id: id, retire_on: values.retire_on, option: values.option })
  if (error) return fail(describeTypeError(error))

  revalidateTypes(id)
  return { success: true }
}

// ── Reactivate ───────────────────────────────────────────────────────────────
// The programme period isn't part of reactivating: change Offered until with Edit.
export async function reactivateTypeAction(_prev: ReactivateFormState, formData: FormData): Promise<ReactivateFormState> {
  const id = str(formData, 'type_id')
  const values = { from: str(formData, 'from') }
  const fail = (error: string, field?: 'from'): ReactivateFormState => ({ ...withField(error, field), values })

  const supabase = await createClient()
  const denied = await requireSuperAdmin(supabase)
  if (denied) return fail(denied)

  const current = await loadType(supabase, id)
  if (!current) return fail('This certification type no longer exists.')
  if (current.status !== 'retired' || !current.open_retirement_id) return fail('This type isn’t retired.')
  const dateErr = validateReactivation(values.from, todayDateString())
  if (dateErr) return fail(dateErr, 'from')

  const { error } = await supabase.from('certification_type_retirements').update({ reactivated_on: values.from }).eq('id', current.open_retirement_id)
  if (error) return fail(describeTypeError(error))

  revalidateTypes(id)
  return { success: true }
}
