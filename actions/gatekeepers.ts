'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { createGatekeeperWithTempPassword, resendGatekeeperWelcomeEmail } from '@/lib/invite-gatekeeper'
import { parsePhone } from '@/lib/phone'
import { validateCertificationDate } from '@/lib/certification-date'
import { checkPhoneAvailable, describePhoneDbError, phoneChanged } from '@/lib/phone-uniqueness.server'

export type GatekeeperActionState = {
  error?: string
  conflict?: boolean
  success?: boolean
  // Only set when the Champion/Super Admin chose "I'll share credentials
  // manually" — the one time this ever appears on screen, since no
  // plaintext password is stored anywhere afterward.
  tempPassword?: string
} | null

export type BulkGatekeeperRow = { row: number; email: string; error?: string; success?: boolean; tempPassword?: string }
export type BulkGatekeeperState = {
  error?: string
  success?: boolean
  results?: BulkGatekeeperRow[]
  createdCount?: number
} | null

function threeYearsFrom(dateStr: string): string {
  const d = new Date(dateStr)
  d.setUTCFullYear(d.getUTCFullYear() + 3)
  return d.toISOString().slice(0, 10)
}

async function inviteAndCreateGatekeeper(params: {
  fullName: string
  email: string
  phone: string // already normalised by parsePhone()
  preferredLanguage: string
  clubId: string
  certificationDate: string
  actorId: string
  sendWelcomeEmail: boolean
}) {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', params.email)
    .maybeSingle()
  if (existing) return { error: 'An account with this email already exists.' }

  // Before createInvitedUser() below sends a real account email.
  const phoneError = await checkPhoneAvailable(params.phone, { creatingGatekeeper: true })
  if (phoneError) return { error: phoneError }

  // Validate club_id BEFORE creating the auth user / sending the invite
  // email below — clubId reaches here as a raw string typed into a CSV
  // cell (bulk upload) or read straight off form data (single create), so
  // it's never guaranteed to be a real club. Without this check, a bad ID
  // only surfaces as a raw Postgres FK-violation message on the later
  // profiles insert, by which point the invite email (with a real temp
  // password) has already been sent for an account that's about to be
  // rolled back.
  const { data: club, error: clubLookupError } = await admin
    .from('clubs')
    .select('name, is_active')
    .eq('id', params.clubId)
    .maybeSingle()
  if (clubLookupError || !club) {
    return { error: 'The selected club could not be found. Double-check the club_id and try again.' }
  }
  if (!club.is_active) {
    return { error: `Club "${club.name}" is currently inactive. Reactivate it first or choose a different club.` }
  }

  const { data: gkCode, error: codeError } = await admin.rpc('next_gatekeeper_code')
  if (codeError) return { error: codeError.message }

  const { data: actor } = await admin.from('profiles').select('full_name, role').eq('id', params.actorId).maybeSingle()

  // {{champion_name}}: when a Champion creates the Gatekeeper, the actor
  // IS the real champion_name — use their own name directly. When a
  // Super Admin creates one instead, "Super Admin created you" is less
  // useful to a Gatekeeper than their actual day-to-day club contact, so
  // this looks up the club's real active Champion and uses that name;
  // only falls back to the Super Admin's own name (per explicit decision)
  // when the club genuinely has no active Champion assigned.
  let championName = actor?.full_name ?? 'Your Champion'
  if (actor?.role === 'super_admin') {
    const { data: linkedChampion } = await admin
      .from('profiles')
      .select('full_name')
      .eq('club_id', params.clubId)
      .eq('role', 'champion')
      .eq('is_active', true)
      .maybeSingle()
    championName = linkedChampion?.full_name ?? actor.full_name ?? 'The Healing Minds Matter Team'
  }

  // Real system-generated temp password (crypto-random — see
  // generate-temp-password.ts), no invite link. See lib/invite-gatekeeper.ts
  // for why this is a separate path from Champion's createInvitedUser flow.
  const appLoginLink = process.env.GATEKEEPER_ANDROID_DOWNLOAD_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const invited = await createGatekeeperWithTempPassword({
    email: params.email,
    fullName: params.fullName,
    championName,
    clubName: club.name,
    appLoginLink,
    sendWelcomeEmail: params.sendWelcomeEmail,
  })
  if ('error' in invited) return { error: invited.error }

  const newUserId = invited.userId
  const qprExpiryDate = threeYearsFrom(params.certificationDate)

  const { error: profileError } = await admin.from('profiles').insert({
    id: newUserId,
    full_name: params.fullName,
    email: params.email,
    phone: params.phone,
    role: 'gatekeeper',
    club_id: params.clubId,
    preferred_language: params.preferredLanguage,
    qpr_certification_date: params.certificationDate,
    qpr_expiry_date: qprExpiryDate,
    gatekeeper_code: gkCode,
    is_active: true,
    // No forced first-login password change needed — the real invite
    // No forced first-login password change — per the spec's "no forced
    // password change gate for Phase 1," the Gatekeeper logs in directly
    // with the emailed (or manually-shared) temp password; the welcome
    // email just nudges them toward Change Password afterward.
    must_change_password: false,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId)
    // The club_id check above should catch this ahead of time, but fall
    // back to a readable message instead of relaying a raw Postgres
    // constraint name if some other FK slips through here in the future.
    if (profileError.code === '23503') {
      return { error: 'Could not save this gatekeeper — one of the referenced records (e.g. the club) no longer exists.' }
    }
    return { error: describePhoneDbError(profileError) ?? profileError.message }
  }

  await writeAuditLog({
    actorId: params.actorId,
    action: 'gatekeeper.created',
    entityType: 'gatekeeper',
    entityId: newUserId,
    details: { full_name: params.fullName, email: params.email, club_id: params.clubId, gatekeeper_code: gkCode },
  })

  return { id: newUserId, gatekeeper_code: gkCode, tempPassword: invited.tempPassword ?? undefined }
}

// inviteAndCreateGatekeeper uses the service-role admin client, which
// bypasses RLS entirely — so club scoping for a Champion caller has to be
// enforced here, not left to the database. A Champion's submitted club_id
// (if any) is always ignored in favor of their own club; only a Super Admin
// may target an arbitrary club. Shared by both the Super Admin and Champion
// create-gatekeeper UIs rather than forked into a second action.
async function resolveScopedClubId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedClubId: string | null
): Promise<{ clubId: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('id', user.id)
    .single()

  if (caller?.role === 'champion') {
    if (!caller.club_id) return { error: 'Your account has no assigned club.' }
    return { clubId: caller.club_id }
  }
  if (caller?.role === 'super_admin') {
    if (!requestedClubId) return { error: 'Assigned club is required.' }
    return { clubId: requestedClubId }
  }
  return { error: 'Not authorized.' }
}

export async function createGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const fullName = (formData.get('full_name') as string | null)?.trim()
  const email    = (formData.get('email') as string | null)?.trim().toLowerCase()
  const parsedPhone = parsePhone(formData.get('phone') as string | null)
  const preferredLanguage = (formData.get('preferred_language') as string | null) || 'en'
  const requestedClubId = formData.get('club_id') as string | null
  const certificationDate = formData.get('certification_date') as string | null
  // Per spec: "Automated notification (optional/deferrable)" — a real
  // checkbox on the create form, not always-on. Checkbox fields are only
  // present in FormData when checked, so absence means "off."
  const sendWelcomeEmail = formData.get('send_welcome_email') === 'on'

  if (!fullName) return { error: 'Full name is required.' }
  if (!email)    return { error: 'Email is required.' }
  if (!parsedPhone.ok) return { error: parsedPhone.error }
  if (!parsedPhone.value) return { error: 'Phone number is required.' }
  const phone = parsedPhone.value
  const certificationError = validateCertificationDate(certificationDate)
  if (certificationError || !certificationDate) return { error: certificationError ?? 'Certification date is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const scoped = await resolveScopedClubId(supabase, requestedClubId)
  if ('error' in scoped) return { error: scoped.error }

  const result = await inviteAndCreateGatekeeper({
    fullName, email, phone, preferredLanguage, clubId: scoped.clubId, certificationDate, actorId: user.id, sendWelcomeEmail,
  })
  if ('error' in result) return { error: result.error }

  revalidatePath('/super-admin/gatekeepers')
  revalidatePath('/champion/gatekeepers')
  // Only present when sendWelcomeEmail was false — the one time this
  // password is ever shown, since it's never stored in plaintext.
  return { success: true, tempPassword: result.tempPassword }
}

// CSV header: full_name,email,phone,club_id,certification_date
// phone is required and must be unique (also within the same file);
// club_id must be a real active club UUID.
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')))
}

export async function createGatekeepersBulkAction(
  _prev: BulkGatekeeperState,
  formData: FormData
): Promise<BulkGatekeeperState> {
  const file = formData.get('csv_file') as File | null
  if (!file || file.size === 0) return { error: 'Select a CSV file to upload.' }
  const sendWelcomeEmail = formData.get('send_welcome_email') === 'on'

  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length === 0) return { error: 'The CSV file is empty.' }

  const header = rows[0].map(h => h.toLowerCase())
  const dataRows = rows.slice(1)
  if (dataRows.length === 0) return { error: 'The CSV file has no data rows.' }
  if (dataRows.length > 50) return { error: `The CSV has ${dataRows.length} rows — maximum is 50 per upload.` }

  const col = (name: string) => header.indexOf(name)
  const nameIdx = col('full_name')
  const emailIdx = col('email')
  const phoneIdx = col('phone')
  const clubIdx = col('club_id')
  const certIdx = col('certification_date')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'champion' && caller?.role !== 'super_admin') {
    return { error: 'Not authorized.' }
  }
  // A Champion's rows are always scoped to their own club regardless of any
  // club_id column in the CSV — same rule as the single-gatekeeper form. A
  // Super Admin's CSV still requires a real club_id column, same as before.
  const forcedClubId = caller.role === 'champion' ? caller.club_id : null
  if (caller.role === 'champion' && !forcedClubId) return { error: 'Your account has no assigned club.' }

  if (nameIdx === -1 || emailIdx === -1 || phoneIdx === -1 || certIdx === -1 || (caller.role === 'super_admin' && clubIdx === -1)) {
    const required = caller.role === 'super_admin'
      ? 'full_name, email, phone, club_id, certification_date'
      : 'full_name, email, phone, certification_date (club_id is optional and ignored)'
    return { error: `CSV header must include: ${required}.` }
  }

  const results: BulkGatekeeperRow[] = []
  let createdCount = 0
  // The database check can't see rows from this same file that haven't been
  // saved yet, so duplicates within the CSV are caught here.
  const phonesInFile = new Map<string, number>()

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const rowNum = i + 2 // 1-indexed + header row
    const fullName = cells[nameIdx]?.trim()
    const email = cells[emailIdx]?.trim().toLowerCase()
    const parsedPhone = parsePhone(cells[phoneIdx])
    const clubId = forcedClubId ?? (clubIdx !== -1 ? cells[clubIdx]?.trim() : undefined)
    const certificationDate = cells[certIdx]?.trim()

    if (!fullName || !email || !clubId || !certificationDate || (parsedPhone.ok && !parsedPhone.value)) {
      results.push({ row: rowNum, email: email || '(missing)', error: 'Missing required field(s).' })
      continue
    }
    const certificationError = validateCertificationDate(certificationDate)
    if (certificationError) {
      results.push({ row: rowNum, email, error: certificationError })
      continue
    }
    if (!parsedPhone.ok) {
      results.push({ row: rowNum, email, error: parsedPhone.error })
      continue
    }
    const phone = parsedPhone.value!
    const firstRow = phonesInFile.get(phone)
    if (firstRow) {
      results.push({ row: rowNum, email, error: `Same phone number as row ${firstRow} in this file. Each user needs their own phone number.` })
      continue
    }
    phonesInFile.set(phone, rowNum)

    const result = await inviteAndCreateGatekeeper({
      fullName, email, phone, preferredLanguage: 'en', clubId, certificationDate, actorId: user.id, sendWelcomeEmail,
    })
    if ('error' in result) {
      results.push({ row: rowNum, email, error: result.error })
    } else {
      results.push({ row: rowNum, email, success: true, tempPassword: result.tempPassword })
      createdCount++
    }
  }

  if (createdCount > 0) {
    revalidatePath('/super-admin/gatekeepers')
    revalidatePath('/champion/gatekeepers')
  }

  return { success: createdCount === dataRows.length, results, createdCount }
}

export async function updateGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId = formData.get('gatekeeper_id') as string
  const knownVersion  = parseInt(formData.get('version') as string, 10)
  const fullName = (formData.get('full_name') as string | null)?.trim()
  const email    = (formData.get('email') as string | null)?.trim().toLowerCase()
  const parsedPhone = parsePhone(formData.get('phone') as string | null)
  const preferredLanguage = (formData.get('preferred_language') as string | null) || 'en'
  const clubId   = formData.get('club_id') as string | null
  const certificationDate = formData.get('certification_date') as string | null

  if (!fullName) return { error: 'Full name is required.' }
  if (!email)    return { error: 'Email is required.' }
  if (!parsedPhone.ok) return { error: parsedPhone.error }
  if (!parsedPhone.value) return { error: 'Phone number is required.' }
  const phone = parsedPhone.value
  if (!clubId)   return { error: 'Assigned club is required.' }
  const certificationError = validateCertificationDate(certificationDate)
  if (certificationError || !certificationDate) return { error: certificationError ?? 'Certification date is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: current } = await supabase
    .from('profiles')
    .select('version, email, club_id, phone')
    .eq('id', gatekeeperId)
    .single()

  if (!current) return { error: 'Gatekeeper not found.' }
  if (current.version !== knownVersion) return { conflict: true }

  if (phoneChanged(current.phone, phone)) {
    const phoneError = await checkPhoneAvailable(phone, { excludeUserId: gatekeeperId })
    if (phoneError) return { error: phoneError }
  }

  const qprExpiryDate = threeYearsFrom(certificationDate)

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      email,
      phone,
      preferred_language: preferredLanguage,
      club_id: clubId,
      qpr_certification_date: certificationDate,
      qpr_expiry_date: qprExpiryDate,
    })
    .eq('id', gatekeeperId)
    .eq('version', knownVersion)
    .select('id')

  if (updateError) {
    // Phone first — a phone clash is also a 23505, and isn't an email problem.
    const phoneDbError = describePhoneDbError(updateError)
    if (phoneDbError) return { error: phoneDbError }
    if (updateError.code === '23505') return { error: 'That email is already used by another account.' }
    return { error: updateError.message }
  }
  if (!updated || updated.length === 0) return { conflict: true }

  const admin = createAdminClient()
  if (email !== current.email) {
    await admin.auth.admin.updateUserById(gatekeeperId, { email })
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'gatekeeper.updated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { full_name: fullName, email, club_id: clubId, club_changed: clubId !== current.club_id },
  })

  revalidatePath(`/super-admin/gatekeepers/${gatekeeperId}`)
  revalidatePath('/super-admin/gatekeepers')
  return { success: true }
}

export async function deactivateGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId = formData.get('gatekeeper_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase
    .from('profiles')
    .update({ is_active: false, deactivation_reason: 'manual' })
    .eq('id', gatekeeperId)

  await writeAuditLog({
    actorId: user.id,
    action: 'gatekeeper.deactivated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { deactivation_reason: 'manual' },
  })

  revalidatePath(`/super-admin/gatekeepers/${gatekeeperId}`)
  revalidatePath('/super-admin/gatekeepers')
  return { success: true }
}

export async function reactivateGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId    = formData.get('gatekeeper_id') as string
  const confirmedClubId = formData.get('club_id') as string | null

  if (!confirmedClubId) return { error: 'Club assignment is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: club } = await supabase
    .from('clubs')
    .select('is_active, name')
    .eq('id', confirmedClubId)
    .single()

  if (!club) return { error: 'Club not found.' }
  if (!club.is_active) {
    return { error: `Club "${club.name}" is currently inactive. Reactivate the club first or assign an active club.` }
  }

  await supabase
    .from('profiles')
    .update({
      is_active: true,
      deactivation_reason: null,
      deactivated_club_id: null,
      club_id: confirmedClubId,
    })
    .eq('id', gatekeeperId)

  await writeAuditLog({
    actorId: user.id,
    action: 'gatekeeper.reactivated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { confirmed_club_id: confirmedClubId, club_name: club.name },
  })

  revalidatePath(`/super-admin/gatekeepers/${gatekeeperId}`)
  revalidatePath('/super-admin/gatekeepers')
  return { success: true }
}

// Real gap closed: no way to resend a Gatekeeper's welcome email existed
// before this (confirmed — no such action or UI anywhere). Issues a
// genuinely new temp password each time (nothing plaintext is ever stored
// to "resend the same one") — correct behavior for "the original email
// got lost/never arrived," not just cosmetic. Meaningful for any active
// gatekeeper, not just ones who never logged in — an admin re-sharing
// credentials after a Gatekeeper forgot theirs is a real use case too.
export async function resendGatekeeperInviteAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId = formData.get('gatekeeper_id') as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: caller } = await supabase.from('profiles').select('role, club_id, full_name').eq('id', user.id).single()
  if (caller?.role !== 'champion' && caller?.role !== 'super_admin') {
    return { error: 'Not authorized.' }
  }

  const admin = createAdminClient()
  const { data: gatekeeper } = await admin
    .from('profiles')
    .select('full_name, email, club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', gatekeeperId)
    .eq('role', 'gatekeeper')
    .maybeSingle()
  if (!gatekeeper) return { error: 'Gatekeeper not found.' }

  // A Champion may only resend for their own club's gatekeepers — this
  // action uses the service-role admin client below (to read/update
  // auth-adjacent state), which bypasses RLS entirely, so this scoping
  // has to be enforced here explicitly, same as every other
  // Champion-reachable gatekeeper action in this file.
  if (caller.role === 'champion' && gatekeeper.club_id !== caller.club_id) {
    return { error: 'Not authorized.' }
  }

  // Same real {{champion_name}} resolution as creation (see
  // inviteAndCreateGatekeeper above) — a Super Admin resending should
  // still name the real linked Champion when one exists, not themselves.
  let championName = caller.full_name ?? 'Your Champion'
  if (caller.role === 'super_admin') {
    const { data: linkedChampion } = await admin
      .from('profiles')
      .select('full_name')
      .eq('club_id', gatekeeper.club_id)
      .eq('role', 'champion')
      .eq('is_active', true)
      .maybeSingle()
    championName = linkedChampion?.full_name ?? caller.full_name ?? 'The Healing Minds Matter Team'
  }

  const appLoginLink = process.env.GATEKEEPER_ANDROID_DOWNLOAD_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const result = await resendGatekeeperWelcomeEmail({
    userId: gatekeeperId,
    email: gatekeeper.email,
    fullName: gatekeeper.full_name,
    championName,
    clubName: (gatekeeper.clubs as unknown as { name: string } | null)?.name ?? 'your club',
    appLoginLink,
  })
  if (result.error) return { error: result.error }

  await writeAuditLog({
    actorId: user.id,
    action: 'gatekeeper.invite_resent',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { email: gatekeeper.email },
  })

  return { success: true }
}
