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

  it('the Change Email form boxes (new email + password) render at 16px', () => {
    const src = read('app/(dashboard)/super-admin/profile/change-email-form.tsx')
    const inputs = [...src.matchAll(/<input[\s\S]*?className="([^"]*)"/g)].map(m => m[1])
    expect(inputs.length).toBeGreaterThanOrEqual(2)
    for (const className of inputs) {
      expect(className).toContain('text-[16px]')
      expect(className).not.toMatch(/(^|\s)text-(xs|sm|\[1[0-5]px\])(\s|$)/)
    }
  })

  it('the Reset Password form boxes (new + confirm) render at 16px and keep new-password autofill', () => {
    const src = read('app/(auth)/reset-password/reset-password-form.tsx')
    const inputs = [...src.matchAll(/<input[\s\S]*?\/>/g)].map(m => m[0])
      .filter(tag => /id="(password|confirm)"/.test(tag))
    expect(inputs).toHaveLength(2)
    for (const tag of inputs) {
      const className = tag.match(/className="([^"]*)"/)?.[1] ?? ''
      expect(className).toContain('text-[16px]')
      expect(className).not.toMatch(/(^|\s)text-(xs|sm|\[1[0-5]px\])(\s|$)/)
      expect(tag).toContain('autoComplete="new-password"')
    }
  })

  it('shows the password rules before the confirm box', () => {
    const src = read(CHANGE_PASSWORD_FORM)
    const rules = src.indexOf('Password Requirements')
    expect(rules).toBeGreaterThan(src.indexOf('id="newPassword"'))
    expect(rules).toBeLessThan(src.indexOf('id="confirm"'))
  })
})

// Fix J part 2 (2026-11-27). The set-up-account and reset-password pages
// (both opened from an email link) share ResetPasswordForm. Its rules must show
// from the start, between New password and Confirm, like Change Password.
describe('set-up-account and reset-password show the rules above Confirm', () => {
  const FORM = 'app/(auth)/reset-password/reset-password-form.tsx'

  it.each([
    'app/(auth)/reset-password/page.tsx',
    'app/auth/set-up-account/page.tsx',
  ])('%s uses the shared ResetPasswordForm', path => {
    expect(read(path)).toMatch(/<ResetPasswordForm[\s>]/)
  })

  it('places the rules between the New password box and the Confirm box', () => {
    const src = read(FORM)
    const rules = src.indexOf('Password requirements')
    expect(rules).toBeGreaterThan(src.indexOf('id="password"'))
    expect(rules).toBeLessThan(src.indexOf('id="confirm"'))
  })

  it('shows the rules before anything is typed (not hidden behind password.length)', () => {
    const src = read(FORM)
    const rulesBlock = src.slice(src.indexOf('Password requirements') - 400, src.indexOf('id="confirm"'))
    expect(rulesBlock).toContain('RULES.map')
    expect(rulesBlock).not.toMatch(/password\.length\s*>\s*0\s*&&\s*\(\s*<div className="grid/)
    // Only the strength bar stays hidden until typing; the rules list appears once.
    expect(src.match(/RULES\.map/g)).toHaveLength(1)
  })
})

describe('email boxes autofill as the sign-in username', () => {
  it.each(EMAIL_FORMS)('%s uses autoComplete="username"', path => {
    const src = read(path)
    expect(src).toContain('autoComplete="username"')
    expect(src).not.toContain('autoComplete="email"')
  })
})
