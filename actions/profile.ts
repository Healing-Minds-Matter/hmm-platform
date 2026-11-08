'use server'

import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { parsePhone } from '@/lib/phone'
import { checkPhoneAvailable, describePhoneDbError, phoneChanged } from '@/lib/phone-uniqueness.server'

export type ProfileData = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  title: string | null
  preferred_language: string
  office_location: string | null
  created_at: string
}

export async function getProfile(): Promise<ProfileData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, title, preferred_language, office_location, created_at')
    .eq('id', user.id)
    .single()

  return data ?? null
}

// fieldErrors: errors tied to a form field, shown next to it (sheet row 32).
export type ProfileActionState = { error?: string; fieldErrors?: FieldErrors; success?: boolean }

export async function updateProfileAction(
  _prev: ProfileActionState | null,
  formData: FormData
): Promise<ProfileActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const full_name = (formData.get('full_name') as string | null)?.trim()
  const parsedPhone = parsePhone(formData.get('phone') as string | null)
  const title     = (formData.get('title')     as string | null)?.trim() || null
  const preferred_language = (formData.get('preferred_language') as string | null) || 'en'
  const office_location = (formData.get('office_location') as string | null)?.trim() || null

  if (!full_name) return invalid('full_name', 'Full name is required.')
  if (full_name.length > 100) return invalid('full_name', 'Full name must be 100 characters or fewer.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  const phone = parsedPhone.value

  const { data: current } = await supabase
    .from('profiles')
    .select('phone, role')
    .eq('id', user.id)
    .single()
  if (current?.role === 'gatekeeper' && !phone) return invalid('phone', 'Phone number is required.')
  if (phone && phoneChanged(current?.phone, phone)) {
    const phoneError = await checkPhoneAvailable(phone, { excludeUserId: user.id })
    if (phoneError) return invalid('phone', phoneError)
  }
  if (title && title.length > 150) return invalid('title', 'Job title must be 150 characters or fewer.')
  if (office_location && office_location.length > 200) return invalid('office_location', 'Office location must be 200 characters or fewer.')

  const { error } = await supabase
    .from('profiles')
    .update({ full_name, phone, title, preferred_language, office_location, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    const phoneDbError = describePhoneDbError(error)
    return phoneDbError ? invalid('phone', phoneDbError) : { error: 'Failed to save changes. Please try again.' }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'profile.update',
    entityType: 'profile',
    entityId: user.id,
    details: { updated_fields: ['full_name', 'phone', 'title', 'preferred_language', 'office_location'] },
  })

  return { success: true }
}
