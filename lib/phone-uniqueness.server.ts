import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePhone } from '@/lib/phone'

// Every user — Super Admin, Champion or Gatekeeper, active or deactivated —
// must have their own phone number, and it stays theirs even if their role
// changes. Checked with the admin client because the caller (e.g. a
// Champion) can't see other clubs' users through RLS, but the number still
// has to be unique across all of them.
//
// Existing rows may still hold older, non-standard formats, so both sides
// are normalised before comparing rather than relying on an exact match.
//
// Returns a user-facing error, or null when the number is free.
export async function checkPhoneAvailable(
  phone: string,
  options: PhoneCheckOptions = {}
): Promise<string | null> {
  return findPhoneClash(phone, await loadPhoneOwners(), options)
}

export type PhoneOwner = { id: string; phone: string; role: string; is_active: boolean }
type PhoneCheckOptions = { excludeUserId?: string; creatingGatekeeper?: boolean }

const PHONE_LOOKUP_FAILED = 'Could not check the phone number right now. Please try again.'

// Every user's number, normalised. This reads the whole profiles table, so a
// bulk upload loads it once per batch and checks each row with
// findPhoneClash() instead of calling checkPhoneAvailable() per row.
// Returns null if the lookup failed.
export async function loadPhoneOwners(): Promise<PhoneOwner[] | null> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, phone, role, is_active')
    .not('phone', 'is', null)
  if (error) return null

  return (rows ?? []).flatMap(row => {
    const parsed = parsePhone(row.phone)
    return parsed.ok && parsed.value ? [{ ...row, phone: parsed.value }] : []
  })
}

export function findPhoneClash(
  phone: string,
  owners: PhoneOwner[] | null,
  options: PhoneCheckOptions = {}
): string | null {
  if (!owners) return PHONE_LOOKUP_FAILED

  const clash = owners.find(row => row.id !== options.excludeUserId && row.phone === phone)
  if (!clash) return null

  // Don't say who it belongs to or which club — a Champion must only ever
  // see their own club's people.
  if (options.creatingGatekeeper && clash.role === 'gatekeeper' && !clash.is_active) {
    return 'This phone number belongs to a deactivated Gatekeeper. Reactivate that Gatekeeper instead of creating a new one.'
  }
  return 'This phone number is already registered to another user. Each user needs their own phone number.'
}

// Readable messages for the database-level phone rules (migration
// 20261001000000_unique_user_phone) — these only fire if something slips
// past the checks above, e.g. two people saving the same number at the same
// moment. Returns null for errors that aren't about the phone.
export function describePhoneDbError(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null
  const message = error.message ?? ''
  if (error.code === '23505' && message.includes('profiles_phone_unique')) {
    return 'This phone number is already registered to another user. Each user needs their own phone number.'
  }
  if (error.code === '23514' && message.includes('profiles_gatekeeper_phone_required')) {
    return 'Phone number is required.'
  }
  if (error.code === '22023' && message.includes('Invalid phone number')) {
    return 'Enter a valid phone number, e.g. 077 123 4567 or +94 77 123 4567.'
  }
  return null
}

// For an edit: only a number that's actually changing is checked, so a
// record that already shares a number (from before this rule existed) can
// still be edited as long as its number is left as it is.
export function phoneChanged(previous: string | null | undefined, next: string | null): boolean {
  const prev = parsePhone(previous)
  const prevValue = prev.ok ? prev.value : (previous ?? null)
  return prevValue !== next
}
