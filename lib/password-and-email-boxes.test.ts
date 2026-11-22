// Fix J part 1 (2026-11-22). Guards two easy-to-undo details on the sign-in
// and password screens:
// - iOS Safari zooms the whole page when a focused input's text is under
//   16px, so the change-password / set-password boxes must stay at 16px.
// - Login and Forgot Password email boxes use autocomplete="username", so
//   password managers pair the saved email with the saved password.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

const CHANGE_PASSWORD_FORM = 'app/(dashboard)/super-admin/profile/change-password-form.tsx'
const EMAIL_FORMS = [
  'app/(auth)/login/login-form.tsx',
  'app/(auth)/forgot-password/forgot-password-form.tsx',
]

describe('change-password boxes do not trigger iPhone zoom', () => {
  it('the shared PasswordInput renders its text at 16px', () => {
    const src = read(CHANGE_PASSWORD_FORM)
    const input = src.slice(src.indexOf('function PasswordInput'), src.indexOf('export function ChangePasswordForm'))
    const className = input.match(/<input[\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? ''
    expect(className).toContain('text-[16px]')
    expect(className).not.toMatch(/(^|\s)text-(xs|sm|\[1[0-5]px\])(\s|$)/)
  })

  it('shows the password rules before the confirm box', () => {
    const src = read(CHANGE_PASSWORD_FORM)
    const rules = src.indexOf('Password Requirements')
    expect(rules).toBeGreaterThan(src.indexOf('id="newPassword"'))
    expect(rules).toBeLessThan(src.indexOf('id="confirm"'))
  })
})

describe('email boxes autofill as the sign-in username', () => {
  it.each(EMAIL_FORMS)('%s uses autoComplete="username"', path => {
    const src = read(path)
    expect(src).toContain('autoComplete="username"')
    expect(src).not.toContain('autoComplete="email"')
  })
})
