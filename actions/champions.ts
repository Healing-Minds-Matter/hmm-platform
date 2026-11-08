'use server'

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { endDelegationsForDeactivatedUser } from '@/actions/permissions'
import { createInvitedUser } from '@/lib/create-invited-user'
import { parsePhone } from '@/lib/phone'
import { checkPhoneAvailable, describePhoneDbError, phoneChanged } from '@/lib/phone-uniqueness.server'

export type ChampionActionState = {
  error?: string
  /** Errors tied to a form field, shown next to it (sheet row 32). */
  fieldErrors?: FieldErrors
  conflict?: boolean
  success?: boolean
  soleChampion?: boolean
} | null

const EMAIL_TAKEN = 'An account with this email already exists.'

export async function createChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  const fullName = (formData.get('full_name') as string | null)?.trim()
  const email    = (formData.get('email')     as string | null)?.trim().toLowerCase()
  const parsedPhone = parsePhone(formData.get('phone') as string | null)
  const title    = (formData.get('title')     as string | null)?.trim() || null
  const clubId   = formData.get('club_id')    as string | null

  if (!fullName) return invalid('full_name', 'Full name is required.')
  if (!email)    return invalid('email', 'Email is required.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  const phone = parsedPhone.value // optional for Champions
  if (!clubId)   return invalid('club_id', 'Club assignment is required.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  // Check for duplicate email in profiles
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existing) return invalid('email', EMAIL_TAKEN)

  // Every user needs their own number — checked before createInvitedUser()
  // below sends a real account email.
  if (phone) {
    const phoneError = await checkPhoneAvailable(phone)
    if (phoneError) return invalid('phone', phoneError)
  }

  const admin = createAdminClient()

  // Creates the auth user with a system-generated temporary password and
  // emails it directly (Supabase's own invite email can't embed a
  // password) — see lib/create-invited-user.ts.
  const invited = await createInvitedUser({ email, fullName, roleLabel: 'Champion' })
  if ('error' in invited) {
    return invited.error === EMAIL_TAKEN ? invalid('email', invited.error) : { error: invited.error }
  }

  const newUserId = invited.userId

  const { error: profileError } = await admin.from('profiles').insert({
    id: newUserId,
    full_name: fullName,
    email,
    phone,
    title,
    role: 'champion',
    club_id: clubId,
    is_active: true,
    must_change_password: true,
  })

  if (profileError) {
    // Roll back auth user if profile insert fails
    await admin.auth.admin.deleteUser(newUserId)
    const phoneDbError = describePhoneDbError(profileError)
    return phoneDbError ? invalid('phone', phoneDbError) : { error: profileError.message }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'champion.created',
    entityType: 'champion',
    entityId: newUserId,
    details: { full_name: fullName, email, club_id: clubId },
  })

  revalidatePath('/super-admin/champions')
  return { success: true }
}

export async function updateChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  const championId   = formData.get('champion_id') as string
  const knownVersion = parseInt(formData.get('version') as string, 10)
  const fullName     = (formData.get('full_name')  as string | null)?.trim()
  const email        = (formData.get('email')      as string | null)?.trim().toLowerCase()
  const parsedPhone  = parsePhone(formData.get('phone') as string | null)
  const title        = (formData.get('title')      as string | null)?.trim() || null
  const clubId       = formData.get('club_id')     as string | null

  if (!fullName) return invalid('full_name', 'Full name is required.')
  if (!email)    return invalid('email', 'Email is required.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  const phone = parsedPhone.value
  if (!clubId)   return invalid('club_id', 'Club assignment is required.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  // OCC: fetch current profile to check version and detect changes
  const { data: current } = await supabase
    .from('profiles')
    .select('version, email, club_id, phone')
    .eq('id', championId)
    .single()

  if (!current) return { error: 'Champion not found.' }
  if (current.version !== knownVersion) return { conflict: true }

  if (phone && phoneChanged(current.phone, phone)) {
    const phoneError = await checkPhoneAvailable(phone, { excludeUserId: championId })
    if (phoneError) return invalid('phone', phoneError)
  }

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, email, phone, title, club_id: clubId })
    .eq('id', championId)
    .eq('version', knownVersion)
    .select('id')

  if (updateError) {
    // Phone first — a phone clash is also a 23505, and isn't an email problem.
    const phoneDbError = describePhoneDbError(updateError)
    if (phoneDbError) return invalid('phone', phoneDbError)
    if (updateError.code === '23505') return invalid('email', 'That email is already used by another account.')
    return { error: updateError.message }
  }
  if (!updated || updated.length === 0) return { conflict: true }

  const admin = createAdminClient()

  // Sync email in auth.users if it changed
  if (email !== current.email) {
    await admin.auth.admin.updateUserById(championId, { email })
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'champion.updated',
    entityType: 'champion',
    entityId: championId,
    details: {
      full_name: fullName,
      email,
      club_id: clubId,
      club_changed: clubId !== current.club_id,
    },
  })

  revalidatePath(`/super-admin/champions/${championId}`)
  revalidatePath('/super-admin/champions')
  return { success: true }
}

export async function deactivateChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  const championId = formData.get('champion_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  // Fetch champion's club to check sole-champion scenario
  const { data: champion } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('id', championId)
    .single()

  await supabase
    .from('profiles')
    .update({ is_active: false, deactivation_reason: 'manual' })
    .eq('id', championId)

  await writeAuditLog({
    actorId: user.id,
    action: 'champion.deactivated',
    entityType: 'champion',
    entityId: championId,
    details: { deactivation_reason: 'manual' },
  })

  await endDelegationsForDeactivatedUser(championId, user.id)

  // Check if this was the sole active champion in the club
  let soleChampion = false
  if (champion?.club_id) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', champion.club_id)
      .eq('role', 'champion')
      .eq('is_active', true)

    soleChampion = count === 0
  }

  revalidatePath(`/super-admin/champions/${championId}`)
  revalidatePath('/super-admin/champions')

  return { success: true, soleChampion }
}

export async function reactivateChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  const championId     = formData.get('champion_id') as string
  const confirmedClubId = formData.get('club_id')    as string | null

  if (!confirmedClubId) return invalid('club_id', 'Club assignment is required.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  // Verify the target club is active
  const { data: club } = await supabase
    .from('clubs')
    .select('is_active, name')
    .eq('id', confirmedClubId)
    .single()

  if (!club) return invalid('club_id', 'Club not found.')
  if (!club.is_active) {
    return invalid('club_id', `Club "${club.name}" is currently inactive. Reactivate the club first or assign an active club.`)
  }

  await supabase
    .from('profiles')
    .update({
      is_active: true,
      deactivation_reason: null,
      deactivated_club_id: null,
      club_id: confirmedClubId,
    })
    .eq('id', championId)

  await writeAuditLog({
    actorId: user.id,
    action: 'champion.reactivated',
    entityType: 'champion',
    entityId: championId,
    details: { confirmed_club_id: confirmedClubId, club_name: club.name },
  })

  revalidatePath(`/super-admin/champions/${championId}`)
  revalidatePath('/super-admin/champions')
  return { success: true }
}
