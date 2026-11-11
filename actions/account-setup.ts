'use server'

import { redirect } from 'next/navigation'
import { completeAccountSetup } from '@/lib/account-setup.server'
import type { FieldErrors } from '@/lib/form-errors'

// Review Finding 2: pressed on /auth/set-up-account by whoever received the
// set-password link at the account's own sign-in address (no sign-in needed:
// holding the single-use link is the proof). Every check is on the server.
export async function setUpAccountAction(
  _prev: { error?: string; fieldErrors?: FieldErrors } | null,
  formData: FormData
): Promise<{ error?: string; fieldErrors?: FieldErrors }> {
  const token = formData.get('token')
  const password = formData.get('password')
  const confirm = formData.get('confirm')
  if (typeof token !== 'string' || typeof password !== 'string' || typeof confirm !== 'string') {
    redirect('/auth/set-up-account?status=invalid')
  }

  const result = await completeAccountSetup(token, password, confirm)
  if ('invalid' in result) redirect('/auth/set-up-account?status=invalid')
  if ('done' in result) redirect(`/auth/set-up-account?status=done&for=${result.role === 'gatekeeper' ? 'app' : result.role}`)
  return { error: result.error, fieldErrors: result.fieldErrors }
}
