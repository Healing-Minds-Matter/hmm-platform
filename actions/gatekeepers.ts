'use server'

import { revalidatePath } from 'next/cache'
import { loginPath } from '@/lib/login-redirect.server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { invalid, type FieldErrors } from '@/lib/form-errors'
import { createGatekeeperWithTempPassword } from '@/lib/invite-gatekeeper'
import { hasSignedIn, issueAccountSetupInvite } from '@/lib/account-setup.server'
import { CHAMPION_EMAIL_LOCKED } from '@/lib/account-sign-in'
import { parsePhone } from '@/lib/phone'
import { checkPhoneAvailable, describePhoneDbError, findPhoneClash, loadPhoneOwners, phoneChanged, type PhoneOwner } from '@/lib/phone-uniqueness.server'
import { readCsvUpload } from '@/lib/csv'
import { batchLines, bulkIntent, type BulkRowResult, type BulkUploadState } from '@/lib/bulk-upload'
import { gatekeeperCsvHeaderError } from '@/lib/gatekeeper-csv'
import { todayDateString } from '@/lib/org-date'
import { TYPE_COLUMNS, type CertificationTypeRow } from '@/lib/certification-types'
import { describeCertError, validateAward } from '@/lib/certificates'
import { requireClubScope, requireRole, type Caller } from '@/lib/auth/guards.server'
import { isEmailAvailable, requestAccountEmailChange } from '@/lib/email-change.server'

export type GatekeeperActionState = {
  error?: string
  /** Errors tied to a form field, shown next to it (sheet row 32). */
  fieldErrors?: FieldErrors
  conflict?: boolean
  success?: boolean
  // Only set when the Champion/Super Admin chose "I'll share credentials
  // manually" — the one time this ever appears on screen, since no
  // plaintext password is stored anywhere afterward.
  tempPassword?: string
  // Set when the Gatekeeper was registered but a certification couldn't be added.
  warning?: string
  /** Set when a new sign-in email is waiting for the new address to confirm (Security Finding 3). */
  emailPending?: string
} | null

type NewGatekeeper = {
  email: string
  phone: string // already normalised by parsePhone()
  clubId: string
}

// What the checks below need from the database, fetched together for a
// group of rows: one query each for emails and phones, plus one per club.
// The bulk check loads this once per batch — looking everything up row by
// row (one query reading every user's phone, each time) made a 50-row check
// take well over a minute on the live site.
type GatekeeperLookups = {
  takenEmails: Set<string>
  phoneOwners: PhoneOwner[] | null
  clubs: Map<string, { name: string; is_active: boolean }>
}

async function loadGatekeeperLookups(rows: Pick<NewGatekeeper, 'email' | 'clubId'>[]): Promise<GatekeeperLookups> {
  const admin = createAdminClient()
  const emails = [...new Set(rows.map(r => r.email))]
  // One lookup per club rather than a single "in" query: a club_id typed
  // into a CSV may not even be a valid ID, and Postgres rejects the whole
  // query over one bad value.
  const clubIds = [...new Set(rows.map(r => r.clubId))]

  const [emailRows, phoneOwners, clubRows] = await Promise.all([
    emails.length ? admin.from('profiles').select('email').in('email', emails) : { data: [] },
    loadPhoneOwners(),
    Promise.all(clubIds.map(async id => {
      const { data } = await admin.from('clubs').select('name, is_active').eq('id', id).maybeSingle()
      return [id, data] as const
    })),
  ])

  const clubs = new Map<string, { name: string; is_active: boolean }>()
  for (const [id, club] of clubRows) if (club) clubs.set(id, club)
  return {
    takenEmails: new Set((emailRows.data ?? []).map(row => row.email as string)),
    phoneOwners,
    clubs,
  }
}

// Everything that can rule a new Gatekeeper out, checked before any account
// is created or email sent. Also used on its own by the bulk upload's
// "check" step, which must not create anything.
// `field` is the single-create form input the error belongs to (sheet row 32).
// Certification problems go under the Certifications list (`cert_type_id`),
// since its inputs repeat once per row.
type GatekeeperField = 'email' | 'phone' | 'club_id' | 'cert_type_id'
type CheckError = { error: string; field?: GatekeeperField }

const EMAIL_TAKEN = 'An account with this email already exists.'

function checkFailed({ error, field }: CheckError): GatekeeperActionState {
  return field ? invalid(field, error) : { error }
}

async function checkNewGatekeeper(params: NewGatekeeper): Promise<{ club: { name: string } } | CheckError> {
  return checkNewGatekeeperAgainst(params, await loadGatekeeperLookups([params]))
}

function checkNewGatekeeperAgainst(
  params: NewGatekeeper,
  lookups: GatekeeperLookups
): { club: { name: string } } | CheckError {
  if (lookups.takenEmails.has(params.email)) return { error: EMAIL_TAKEN, field: 'email' }

  // Before createInvitedUser() below sends a real account email.
  const phoneError = findPhoneClash(params.phone, lookups.phoneOwners, { creatingGatekeeper: true })
  if (phoneError) return { error: phoneError, field: 'phone' }

  // Validate club_id BEFORE creating the auth user / sending the invite
  // email below — clubId reaches here as a raw string typed into a CSV
  // cell (bulk upload) or read straight off form data (single create), so
  // it's never guaranteed to be a real club. Without this check, a bad ID
  // only surfaces as a raw Postgres FK-violation message on the later
  // profiles insert, by which point the invite email (with a real temp
  // password) has already been sent for an account that's about to be
  // rolled back.
  const club = lookups.clubs.get(params.clubId)
  if (!club) {
    return { error: 'The selected club could not be found. Double-check the club_id and try again.', field: 'club_id' }
  }
  if (!club.is_active) {
    return { error: `Club "${club.name}" is currently inactive. Reactivate it first or choose a different club.`, field: 'club_id' }
  }
  return { club: { name: club.name } }
}

async function inviteAndCreateGatekeeper(params: {
  fullName: string
  email: string
  phone: string // already normalised by parsePhone()
  preferredLanguage: string
  clubId: string
  actorId: string
  sendWelcomeEmail: boolean
}): Promise<CheckError | { id: string; gatekeeper_code: string; tempPassword?: string }> {
  const checked = await checkNewGatekeeper(params)
  if ('error' in checked) return checked
  const club = checked.club
  const admin = createAdminClient()

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
  if ('error' in invited) return invited.error === EMAIL_TAKEN ? { error: invited.error, field: 'email' } : { error: invited.error }

  const newUserId = invited.userId

  const { error: profileError } = await admin.from('profiles').insert({
    id: newUserId,
    full_name: params.fullName,
    email: params.email,
    phone: params.phone,
    role: 'gatekeeper',
    club_id: params.clubId,
    preferred_language: params.preferredLanguage,
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
    const phoneDbError = describePhoneDbError(profileError)
    return phoneDbError ? { error: phoneDbError, field: 'phone' } : { error: profileError.message }
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
): Promise<{ clubId: string } | CheckError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

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
    if (!requestedClubId) return { error: 'Assigned club is required.', field: 'club_id' }
    return { clubId: requestedClubId }
  }
  return { error: 'Not authorized.' }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Checks the Add Gatekeeper form's certifications before anyone is created.
async function checkNewGatekeeperCertificates(supabase: ServerClient, typeIds: string[], dates: string[]):
  Promise<{ rows: { type: CertificationTypeRow; achievedOn: string }[] } | CheckError> {
  const pairs = typeIds.map((typeId, i) => ({ typeId, achievedOn: dates[i] ?? '' })).filter(p => p.typeId || p.achievedOn)
  if (!pairs.length) return { rows: [] }
  const { data: allowed } = await supabase.rpc('cert_can', { p_permission: 'certifications.award' })
  if (allowed !== true) return { error: 'You don’t have permission to add certifications.' }
  const { data } = await supabase.from('certification_type_statuses').select(TYPE_COLUMNS)
  const types = new Map(((data as CertificationTypeRow[] | null) ?? []).map(t => [t.id, t]))
  const today = todayDateString()
  const rows: { type: CertificationTypeRow; achievedOn: string }[] = []
  for (const [i, p] of pairs.entries()) {
    const type = types.get(p.typeId) ?? null
    const invalid = validateAward({ achievedOn: p.achievedOn, format: 'physical' }, type, today)
    if (invalid) return { error: `Certification ${i + 1}: ${invalid}`, field: 'cert_type_id' }
    if (rows.some(r => r.type.id === type!.id)) return { error: `${type!.name} is listed twice.`, field: 'cert_type_id' }
    rows.push({ type: type!, achievedOn: p.achievedOn })
  }
  return { rows }
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
  // Certifications to add (Story 10.5 Sc05): repeated type + date pairs, all optional.
  const certTypeIds = formData.getAll('cert_type_id').map(v => String(v).trim())
  const certDates = formData.getAll('cert_achieved_on').map(v => String(v).trim())
  // Per spec: "Automated notification (optional/deferrable)" — a real
  // checkbox on the create form, not always-on. Checkbox fields are only
  // present in FormData when checked, so absence means "off."
  const sendWelcomeEmail = formData.get('send_welcome_email') === 'on'

  if (!fullName) return invalid('full_name', 'Full name is required.')
  if (!email)    return invalid('email', 'Email is required.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  if (!parsedPhone.value) return invalid('phone', 'Phone number is required.')
  const phone = parsedPhone.value

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

  const scoped = await resolveScopedClubId(supabase, requestedClubId)
  if ('error' in scoped) return checkFailed(scoped)

  const certs = await checkNewGatekeeperCertificates(supabase, certTypeIds, certDates)
  if ('error' in certs) return checkFailed(certs)

  const result = await inviteAndCreateGatekeeper({
    fullName, email, phone, preferredLanguage, clubId: scoped.clubId, actorId: user.id, sendWelcomeEmail,
  })
  if ('error' in result) return checkFailed(result)

  // Added with the user's own client, so the certificate rules and audit apply as on a profile.
  const failed: string[] = []
  for (const c of certs.rows) {
    const { error } = await supabase.from('certificates').insert({ holder_id: result.id, type_id: c.type.id, achieved_on: c.achievedOn })
    if (error) failed.push(`${c.type.name}: ${describeCertError(error)}`)
  }
  if (failed.length) {
    revalidatePath('/super-admin/gatekeepers')
    revalidatePath('/champion/gatekeepers')
    return {
      success: true, tempPassword: result.tempPassword,
      warning: `The Gatekeeper was registered, but these certifications couldn’t be added. Add them from their profile. ${failed.join(' ')}`,
    }
  }

  revalidatePath('/super-admin/gatekeepers')
  revalidatePath('/champion/gatekeepers')
  // Only present when sendWelcomeEmail was false — the one time this
  // password is ever shown, since it's never stored in plaintext.
  return { success: true, tempPassword: result.tempPassword }
}

// CSV header: full_name,email,phone,club_id (see lib/gatekeeper-csv.ts). Certificates
// aren't part of registration: they're added from each person's Certifications section.
// phone is required and must be unique (also within the same file);
// club_id must be a real active club UUID.

// Two steps (see lib/bulk-upload.ts): intent=check runs every check below
// without creating accounts or sending email; intent=save checks again and
// registers the rows that pass, skipping the rest.
export async function createGatekeepersBulkAction(
  _prev: BulkUploadState,
  formData: FormData
): Promise<BulkUploadState> {
  const intent = bulkIntent(formData)
  const sendWelcomeEmail = formData.get('send_welcome_email') === 'on'

  const upload = await readCsvUpload(formData.get('csv_file') as File | null)
  if ('error' in upload) return { error: upload.error }
  const { header, rows: dataRows } = upload

  const col = (name: string) => header.indexOf(name)
  const nameIdx = col('full_name')
  const emailIdx = col('email')
  const phoneIdx = col('phone')
  const clubIdx = col('club_id')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(await loginPath())

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

  const headerError = gatekeeperCsvHeaderError(header, caller.role)
  if (headerError) return { error: headerError }

  const results: BulkRowResult[] = []
  // The check step saves nothing, so the database can't see other rows in
  // this file: duplicates within the CSV are caught here. The save step
  // skips this — rows are created one by one, so a later duplicate meets the
  // earlier, now-saved row in the database check ("already exists"), which
  // is also the reason that still makes sense in the "failed rows" file.
  const phonesInFile = new Map<string, number>()
  const emailsInFile = new Map<string, number>()
  // One batch of rows per request (see lib/bulk-upload.ts). A check still
  // reads every row for the in-file duplicates above, but only looks rows up
  // in the database, and reports them, when they're in this batch.
  const lines = batchLines(formData)
  // Check step: rows that pass the checks above, looked up in the database
  // together once the loop is done. Each holds its place in `results`.
  const toLookUp: { index: number; row: NewGatekeeper }[] = []

  for (const { line: rowNum, cells } of dataRows) {
    const inBatch = !lines || lines.has(rowNum)
    if (intent === 'save' && !inBatch) continue
    const fullName = cells[nameIdx]?.trim()
    const email = cells[emailIdx]?.trim().toLowerCase()
    const parsedPhone = parsePhone(cells[phoneIdx])
    const clubId = forcedClubId ?? (clubIdx !== -1 ? cells[clubIdx]?.trim() : undefined)
    const fail = (error: string) => {
      if (inBatch) results.push({ row: rowNum, label: email || '(missing)', status: 'failed', error })
    }

    if (!fullName || !email || !clubId || (parsedPhone.ok && !parsedPhone.value)) {
      fail('Missing required field(s).')
      continue
    }
    if (!parsedPhone.ok) { fail(parsedPhone.error); continue }
    const phone = parsedPhone.value!

    if (intent === 'check') {
      const firstEmailRow = emailsInFile.get(email)
      if (firstEmailRow) { fail(`Same email as row ${firstEmailRow} in this file.`); continue }
      const firstPhoneRow = phonesInFile.get(phone)
      if (firstPhoneRow) {
        fail(`Same phone number as row ${firstPhoneRow} in this file. Each user needs their own phone number.`)
        continue
      }
      emailsInFile.set(email, rowNum)
      phonesInFile.set(phone, rowNum)
      if (!inBatch) continue

      toLookUp.push({ index: results.length, row: { email, phone, clubId } })
      results.push({ row: rowNum, label: email, status: 'ready' })
      continue
    }

    const result = await inviteAndCreateGatekeeper({
      fullName, email, phone, preferredLanguage: 'en', clubId, actorId: user.id, sendWelcomeEmail,
    })
    if ('error' in result) fail(result.error)
    else results.push({ row: rowNum, label: email, status: 'created', tempPassword: result.tempPassword })
  }

  if (toLookUp.length) {
    const lookups = await loadGatekeeperLookups(toLookUp.map(entry => entry.row))
    for (const { index, row } of toLookUp) {
      const checked = checkNewGatekeeperAgainst(row, lookups)
      if ('error' in checked) results[index] = { ...results[index], status: 'failed', error: checked.error }
    }
  }

  if (results.some(r => r.status === 'created')) {
    revalidatePath('/super-admin/gatekeepers')
    revalidatePath('/champion/gatekeepers')
  }

  return { intent, results }
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

  const target = await guardGatekeeperTarget(gatekeeperId, 'edit')
  if ('error' in target) return { error: target.error }
  const { caller } = target
  const supabase = caller.supabase

  if (!fullName) return invalid('full_name', 'Full name is required.')
  if (!email)    return invalid('email', 'Email is required.')
  if (!EMAIL_RE.test(email)) return invalid('email', 'Enter a valid email address.')
  if (!parsedPhone.ok) return invalid('phone', parsedPhone.error)
  if (!parsedPhone.value) return invalid('phone', 'Phone number is required.')
  const phone = parsedPhone.value
  if (!['en', 'si', 'ta'].includes(preferredLanguage)) return invalid('preferred_language', 'Select a valid language.')
  if (!clubId)   return invalid('club_id', 'Assigned club is required.')
  if (!UUID_RE.test(clubId)) return invalid('club_id', 'Select a valid club.')

  const { data: current } = await supabase
    .from('profiles')
    .select('version, email, club_id, phone')
    .eq('id', gatekeeperId)
    .single()

  if (!current) return { error: 'Gatekeeper not found.' }
  if (current.version !== knownVersion) return { conflict: true }

  // Moving to another club: a Champion can't (own club only); a Super Admin
  // only into an active club.
  if (clubId !== current.club_id) {
    if (!requireClubScope(caller, clubId).ok) return invalid('club_id', 'You can only assign Gatekeepers to your own club.')
    const { data: club } = await supabase.from('clubs').select('name, is_active').eq('id', clubId).maybeSingle()
    if (!club) return invalid('club_id', 'Club not found.')
    if (!club.is_active) return invalid('club_id', `Club "${club.name}" is currently inactive. Reactivate the club first or assign an active club.`)
  }

  const emailChanged = email !== current.email.toLowerCase()
  // Review Finding 2: once the Gatekeeper has signed in, only a Super Admin
  // may change their sign-in email (a Champion may only fix a typo before
  // first sign-in). If the check can't be made, a Champion is refused.
  if (emailChanged && caller.role !== 'super_admin') {
    const signedIn = await hasSignedIn(gatekeeperId).catch(() => true)
    if (signedIn) return invalid('email', CHAMPION_EMAIL_LOCKED)
  }
  if (emailChanged && !(await isEmailAvailable(email, gatekeeperId))) {
    return invalid('email', 'That email is already used by another account.')
  }

  if (phoneChanged(current.phone, phone)) {
    const phoneError = await checkPhoneAvailable(phone, { excludeUserId: gatekeeperId })
    if (phoneError) return invalid('phone', phoneError)
  }

  // Certifications are no longer edited here: they're managed in the profile's
  // Certifications section (Epic 10), which keeps the older certification dates in step.
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    // Email is never written here: a new sign-in email only applies once the
    // new address confirms (Security Finding 3; see below).
    .update({
      full_name: fullName,
      phone,
      preferred_language: preferredLanguage,
      club_id: clubId,
    })
    .eq('id', gatekeeperId)
    .eq('version', knownVersion)
    .select('id')

  if (updateError) {
    // Phone first — a phone clash is also a 23505, and isn't an email problem.
    const phoneDbError = describePhoneDbError(updateError)
    if (phoneDbError) return invalid('phone', phoneDbError)
    return { error: updateError.message }
  }
  if (!updated || updated.length === 0) return { conflict: true }

  await writeAuditLog({
    actorId: caller.id,
    action: 'gatekeeper.updated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { full_name: fullName, club_id: clubId, club_changed: clubId !== current.club_id },
  })

  let emailPending: string | undefined
  if (emailChanged) {
    const started = await requestAccountEmailChange({
      userId: gatekeeperId, currentEmail: current.email, newEmail: email, fullName, requestedBy: caller.id,
    })
    if ('error' in started) {
      revalidateGatekeeper(gatekeeperId)
      return started.field ? invalid('email', started.error) : { error: `Other changes were saved. ${started.error}` }
    }
    emailPending = email
  }

  revalidateGatekeeper(gatekeeperId)
  return { success: true, emailPending }
}

function revalidateGatekeeper(gatekeeperId: string) {
  revalidatePath(`/super-admin/gatekeepers/${gatekeeperId}`)
  revalidatePath('/super-admin/gatekeepers')
  revalidatePath(`/champion/gatekeepers/${gatekeeperId}`)
  revalidatePath('/champion/gatekeepers')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shared check for actions on an existing Gatekeeper: an active Super Admin,
// or an active Champion of that Gatekeeper's club. The Gatekeeper and their
// club are looked up here, never taken from the form.
async function guardGatekeeperTarget(gatekeeperId: string, verb: string):
  Promise<{ caller: Caller; clubId: string | null } | { error: string }> {
  const guard = await requireRole(['super_admin', 'champion'], `Only Super Admins and Champions can ${verb} Gatekeepers.`)
  if (!guard.ok) {
    if (guard.reason === 'unauthenticated') redirect(await loginPath())
    return { error: guard.message }
  }
  if (!UUID_RE.test(gatekeeperId ?? '')) return { error: 'Gatekeeper not found.' }
  const { data: target } = await guard.caller.supabase
    .from('profiles').select('role, club_id').eq('id', gatekeeperId).maybeSingle()
  if (!target || target.role !== 'gatekeeper') return { error: 'Gatekeeper not found.' }
  const scope = requireClubScope(guard.caller, target.club_id)
  if (!scope.ok) return { error: scope.message }
  return { caller: guard.caller, clubId: target.club_id }
}

export async function deactivateGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId = formData.get('gatekeeper_id') as string

  const target = await guardGatekeeperTarget(gatekeeperId, 'deactivate')
  if ('error' in target) return { error: target.error }
  const { caller } = target

  const { data: changed, error: updateError } = await caller.supabase
    .from('profiles')
    .update({ is_active: false, deactivation_reason: 'manual' })
    .eq('id', gatekeeperId)
    .select('id')
  if (updateError || !changed?.length) return { error: 'The Gatekeeper could not be deactivated. Please try again.' }

  await writeAuditLog({
    actorId: caller.id,
    action: 'gatekeeper.deactivated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { deactivation_reason: 'manual' },
  })

  revalidateGatekeeper(gatekeeperId)
  return { success: true }
}

export async function reactivateGatekeeperAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId    = formData.get('gatekeeper_id') as string
  const confirmedClubId = formData.get('club_id') as string | null

  const target = await guardGatekeeperTarget(gatekeeperId, 'reactivate')
  if ('error' in target) return { error: target.error }
  const { caller } = target
  const supabase = caller.supabase

  if (!confirmedClubId) return invalid('club_id', 'Club assignment is required.')
  if (!UUID_RE.test(confirmedClubId)) return invalid('club_id', 'Select a valid club.')
  if (!requireClubScope(caller, confirmedClubId).ok) return invalid('club_id', 'You can only assign Gatekeepers to your own club.')

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
    .eq('id', gatekeeperId)
    .select('id')
  if (updateError || !changed?.length) return { error: 'The Gatekeeper could not be reactivated. Please try again.' }

  await writeAuditLog({
    actorId: caller.id,
    action: 'gatekeeper.reactivated',
    entityType: 'gatekeeper',
    entityId: gatekeeperId,
    details: { confirmed_club_id: confirmedClubId, club_name: club.name },
  })

  revalidateGatekeeper(gatekeeperId)
  return { success: true }
}

// Review Finding 2: "Resend invite" only for a Gatekeeper who has never
// signed in. It emails a single-use set-password link to the account's own
// sign-in address; it never creates, shows or emails a password. Once the
// Gatekeeper has signed in, a forgotten password is reset from the app.
export async function resendGatekeeperInviteAction(
  _prev: GatekeeperActionState,
  formData: FormData
): Promise<GatekeeperActionState> {
  const gatekeeperId = formData.get('gatekeeper_id') as string

  const target = await guardGatekeeperTarget(gatekeeperId, 'invite')
  if ('error' in target) return { error: target.error }
  const { caller } = target

  const { data: gatekeeper } = await createAdminClient()
    .from('profiles').select('is_active').eq('id', gatekeeperId).maybeSingle()
  if (!gatekeeper?.is_active) return { error: 'This Gatekeeper is deactivated. Reactivate them first.' }

  const signedIn = await hasSignedIn(gatekeeperId).catch(() => true)
  if (signedIn) {
    return { error: 'This Gatekeeper has already signed in, so there’s no invite to resend. If they’ve forgotten their password, they can reset it from the app’s sign-in screen.' }
  }

  const result = await issueAccountSetupInvite({ userId: gatekeeperId, requestedBy: caller.id })
  if ('error' in result) return { error: result.error }

  revalidateGatekeeper(gatekeeperId)
  return { success: true }
}
