'use server'

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { endDelegationsForDeactivatedUser } from '@/actions/permissions'
import { createInvitedUser } from '@/lib/create-invited-user'
import { parsePhone } from '@/lib/phone'
import { checkPhoneAvailable, describePhoneDbError, phoneChanged } from '@/lib/phone-uniqueness.server'
import { requireRole } from '@/lib/auth/guards.server'
import { parseCreateChampion } from '@/lib/validation/champion'
import { isEmailAvailable, requestAccountEmailChange } from '@/lib/email-change.server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ChampionActionState = {
  error?: string
  /** Errors tied to a form field, shown next to it (sheet row 32). */
  fieldErrors?: FieldErrors
  conflict?: boolean
  success?: boolean
  soleChampion?: boolean
  /** Set when a new sign-in email is waiting for the new address to confirm (Security Finding 3). */
  emailPending?: string
} | null

const EMAIL_TAKEN = 'An account with this email already exists.'

export async function createChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  // Lock 1 (server): only an active Super Admin. Lock 2 is the database's
  // "profiles: super_admin insert" policy — the profile is written below with
  // the caller's own client, so that policy applies too.
  const guard = await requireRole(['super_admin'], 'Only Super Admins can create Champion accounts.')
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return { error: guard.message }
  }
  const { caller } = guard
  const supabase = caller.supabase

  const parsed = parseCreateChampion(formData)
  if (!parsed.ok) return invalid(parsed.field, parsed.error)
  const { full_name: fullName, email, title, club_id: clubId } = parsed.value
  const parsedPhone = parsePhone(formData.get('phone') as string | null)
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  const phone = parsedPhone.value // optional for Champions

  // The club must exist and be active — looked up here, never trusted from the form.
  const { data: club } = await supabase
    .from('clubs')
    .select('id, name, is_active')
    .eq('id', clubId)
    .maybeSingle()
  if (!club) return invalid('club_id', 'Club not found.')
  if (!club.is_active) {
    return invalid('club_id', `Club "${club.name}" is currently inactive. Reactivate the club first or assign an active club.`)
  }

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

  // Creates the auth user with a system-generated temporary password and
  // emails it directly (Supabase's own invite email can't embed a
  // password) — see lib/create-invited-user.ts. Uses the service-role key,
  // which is why it only runs after the guard above has passed.
  const invited = await createInvitedUser({ email, fullName, roleLabel: 'Champion' })
  if ('error' in invited) {
    return invited.error === EMAIL_TAKEN ? invalid('email', invited.error) : { error: invited.error }
  }

  const newUserId = invited.userId

  // Written with the caller's own client (not the service-role key), so the
  // database checks the caller is a Super Admin as well, and the club
  // trigger refuses an inactive club.
  const { error: profileError } = await supabase.from('profiles').insert({
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
    await createAdminClient().auth.admin.deleteUser(newUserId)
    const phoneDbError = describePhoneDbError(profileError)
    if (phoneDbError) return invalid('phone', phoneDbError)
    if (profileError.code === '42501') return { error: 'Only Super Admins can create Champion accounts.' }
    if (profileError.code === '23514') return invalid('club_id', 'This club is inactive. Reactivate the club first or assign an active club.')
    return { error: profileError.message }
  }

  await writeAuditLog({
    actorId: caller.id,
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

  const guard = await requireRole(['super_admin'], 'Only Super Admins can edit Champion accounts.')
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return { error: guard.message }
  }
  const { caller } = guard
  const supabase = caller.supabase

  if (!UUID_RE.test(championId ?? '')) return { error: 'Champion not found.' }
  if (!fullName) return invalid('full_name', 'Full name is required.')
  if (!email)    return invalid('email', 'Email is required.')
  if (!EMAIL_RE.test(email)) return invalid('email', 'Enter a valid email address.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  const phone = parsedPhone.value
  if (!clubId)   return invalid('club_id', 'Club assignment is required.')
  if (!UUID_RE.test(clubId)) return invalid('club_id', 'Select a valid club.')

  // OCC: fetch current profile to check version and detect changes
  const { data: current } = await supabase
    .from('profiles')
    .select('version, email, club_id, phone, role')
    .eq('id', championId)
    .single()

  if (!current || current.role !== 'champion') return { error: 'Champion not found.' }
  if (current.version !== knownVersion) return { conflict: true }
  const emailChanged = email !== current.email.toLowerCase()
  if (emailChanged && !(await isEmailAvailable(email, championId))) {
    return invalid('email', 'That email is already used by another account.')
  }

  if (phone && phoneChanged(current.phone, phone)) {
    const phoneError = await checkPhoneAvailable(phone, { excludeUserId: championId })
    if (phoneError) return invalid('phone', phoneError)
  }

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    // Email is never written here: a new sign-in email only applies once the
    // new address confirms (Security Finding 3; see below).
    .update({ full_name: fullName, phone, title, club_id: clubId })
    .eq('id', championId)
    .eq('version', knownVersion)
    .select('id')

  if (updateError) {
    // Phone first — a phone clash is also a 23505, and isn't an email problem.
    const phoneDbError = describePhoneDbError(updateError)
    if (phoneDbError) return invalid('phone', phoneDbError)
    if (updateError.code === '23514') return invalid('club_id', 'This club is inactive. Reactivate the club first or assign an active club.')
    return { error: updateError.message }
  }
  if (!updated || updated.length === 0) return { conflict: true }

  await writeAuditLog({
    actorId: caller.id,
    action: 'champion.updated',
    entityType: 'champion',
    entityId: championId,
    details: {
      full_name: fullName,
      club_id: clubId,
      club_changed: clubId !== current.club_id,
    },
  })

  let emailPending: string | undefined
  if (emailChanged) {
    const started = await requestAccountEmailChange({
      userId: championId, currentEmail: current.email, newEmail: email, fullName, requestedBy: caller.id,
    })
    if ('error' in started) {
      revalidatePath(`/super-admin/champions/${championId}`)
      return started.field ? invalid('email', started.error) : { error: `Other changes were saved. ${started.error}` }
    }
    emailPending = email
  }

  revalidatePath(`/super-admin/champions/${championId}`)
  revalidatePath('/super-admin/champions')
  return { success: true, emailPending }
}

export async function deactivateChampionAction(
  _prev: ChampionActionState,
  formData: FormData
): Promise<ChampionActionState> {
  const championId = formData.get('champion_id') as string

  const guard = await requireRole(['super_admin'], 'Only Super Admins can deactivate Champion accounts.')
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return { error: guard.message }
  }
  const { caller } = guard
  const supabase = caller.supabase
  if (!UUID_RE.test(championId ?? '')) return { error: 'Champion not found.' }

  // Fetch champion's club to check sole-champion scenario
  const { data: champion } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('id', championId)
    .single()
  if (!champion || champion.role !== 'champion') return { error: 'Champion not found.' }

  const { data: changed, error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: false, deactivation_reason: 'manual' })
    .eq('id', championId)
    .select('id')
  if (updateError || !changed?.length) return { error: 'The Champion could not be deactivated. Please try again.' }

  await writeAuditLog({
    actorId: caller.id,
    action: 'champion.deactivated',
    entityType: 'champion',
    entityId: championId,
    details: { deactivation_reason: 'manual' },
  })

  await endDelegationsForDeactivatedUser(championId, caller.id)

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

  const guard = await requireRole(['super_admin'], 'Only Super Admins can reactivate Champion accounts.')
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return { error: guard.message }
  }
  const { caller } = guard
  const supabase = caller.supabase

  if (!confirmedClubId) return invalid('club_id', 'Club assignment is required.')
  if (!UUID_RE.test(confirmedClubId)) return invalid('club_id', 'Select a valid club.')
  if (!UUID_RE.test(championId ?? '')) return { error: 'Champion not found.' }
  const { data: target } = await supabase.from('profiles').select('role').eq('id', championId).single()
  if (!target || target.role !== 'champion') return { error: 'Champion not found.' }

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

  const { data: changed, error: updateError } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      deactivation_reason: null,
      deactivated_club_id: null,
      club_id: confirmedClubId,
    })
    .eq('id', championId)
    .select('id')
  if (updateError || !changed?.length) return { error: 'The Champion could not be reactivated. Please try again.' }

  await writeAuditLog({
    actorId: caller.id,
    action: 'champion.reactivated',
    entityType: 'champion',
    entityId: championId,
    details: { confirmed_club_id: confirmedClubId, club_name: club.name },
  })

  revalidatePath(`/super-admin/champions/${championId}`)
  revalidatePath('/super-admin/champions')
  return { success: true }
}
