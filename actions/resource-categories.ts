'use server'

// Resources > Categories (sheet row 26): create, rename, deactivate/reactivate
// and delete (unused only). The database enforces the same rules and writes
// the audit log (migration 20261110000000); the checks here give plain-English
// messages tied to the right field before anything is sent.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { checkCategoryName, type ResourceCategory } from '@/lib/resource-categories'
import type { FieldErrors } from '@/lib/form-errors'

export type CategoryActionState = { error?: string; fieldErrors?: FieldErrors; success?: boolean } | null

const MANAGE_CATEGORIES_PERMISSION = 'manage_resource_categories'

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function authorise(): Promise<{ supabase: ServerClient } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // The shared permission resolver (Super Admins pass; this key is Super-Admin-only).
  const { data: allowed } = await supabase.rpc('cert_can', { p_permission: MANAGE_CATEGORIES_PERMISSION })
  if (allowed !== true) return { error: "You don't have permission to manage resource categories." }
  return { supabase }
}

async function listAll(supabase: ServerClient): Promise<ResourceCategory[]> {
  const { data } = await supabase.from('resource_categories').select('id, name, is_active')
  return data ?? []
}

function refresh() {
  revalidatePath('/super-admin/resources/categories')
  revalidatePath('/super-admin/resources')
  revalidatePath('/champion/resources')
}

function describeDbError(error: { code?: string; message: string }, field = 'name'): CategoryActionState {
  if (error.code === '23505') {
    const msg = 'A category with that name already exists.'
    return { error: msg, fieldErrors: { [field]: msg } }
  }
  if (error.code === '42501') return { error: "You don't have permission to manage resource categories." }
  return { error: error.message }
}

export async function createCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }
  const all = await listAll(auth.supabase)
  const checked = checkCategoryName(formData.get('name') as string | null, all)
  if (!checked.ok) return { error: checked.error, fieldErrors: { name: checked.error } }

  const order = all.length + 1
  const { data: { user } } = await auth.supabase.auth.getUser()
  const { error } = await auth.supabase.from('resource_categories').insert({ name: checked.name, display_order: order, created_by: user?.id })
  if (error) return describeDbError(error)
  refresh()
  return { success: true }
}

export async function renameCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const id = formData.get('category_id') as string | null
  if (!id) return { error: 'Category not found.' }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }
  const all = await listAll(auth.supabase)
  if (!all.some(c => c.id === id)) return { error: 'Category not found.' }
  const checked = checkCategoryName(formData.get('name') as string | null, all, id)
  if (!checked.ok) return { error: checked.error, fieldErrors: { name: checked.error } }

  const { error } = await auth.supabase.from('resource_categories').update({ name: checked.name }).eq('id', id)
  if (error) return describeDbError(error)
  refresh()
  return { success: true }
}

export async function setCategoryActiveAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const id = formData.get('category_id') as string | null
  const active = formData.get('active') === 'true'
  if (!id) return { error: 'Category not found.' }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  const { data, error } = await auth.supabase.from('resource_categories').update({ is_active: active }).eq('id', id).select('id')
  if (error) return describeDbError(error)
  if (!data?.length) return { error: 'Category not found.' }
  refresh()
  return { success: true }
}

export async function deleteCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const id = formData.get('category_id') as string | null
  if (!id) return { error: 'Category not found.' }
  const auth = await authorise()
  if ('error' in auth) return { error: auth.error }

  // A category in use can only be deactivated (the database refuses too).
  const { count } = await auth.supabase.from('resources').select('id', { count: 'exact', head: true }).eq('category_id', id)
  if ((count ?? 0) > 0) {
    return { error: `This category is used by ${count} resource${count === 1 ? '' : 's'}, so it can't be deleted. Deactivate it instead.` }
  }
  const { data, error } = await auth.supabase.from('resource_categories').delete().eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Category not found.' }
  refresh()
  return { success: true }
}
