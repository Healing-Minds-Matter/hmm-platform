'use server'

import { confirmAccountEmailChange, type ConfirmEmailChangeResult } from '@/lib/email-change.server'

// Pressed on /auth/confirm-account-email by whoever received the link at the
// new address (no sign-in needed: holding the one-time link is the proof).
export async function confirmAccountEmailAction(
  _prev: { status: ConfirmEmailChangeResult } | null,
  formData: FormData
): Promise<{ status: ConfirmEmailChangeResult }> {
  const token = formData.get('token')
  if (typeof token !== 'string') return { status: 'invalid' }
  return { status: await confirmAccountEmailChange(token) }
}
