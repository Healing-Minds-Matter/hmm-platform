// Client-safe — no server-only imports

// Root words for the most commonly used/breached passwords. Checked against
// a leetspeak-normalized, letters-only reduction of the input (see
// normalizeForWeaknessCheck) so predictable variants like "Passw0rd!",
// "MyPassword1!", or "P@ssword123" are caught too, not just exact matches —
// a plain exact-string list would almost never fire, since anything that
// already satisfies the character-class rules below is unlikely to be a
// byte-for-byte match against a small fixed list.
const COMMON_PASSWORD_BASES = [
  'password', 'admin', 'welcome', 'qwerty', 'asdf', 'letmein', 'trustno',
  'iloveyou', 'monkey', 'dragon', 'master', 'shadow', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'batman', 'freedom', 'whatever',
  'secret', 'access', 'hello', 'changeme', 'login', 'test', 'summer',
  'winter', 'spring', 'autumn', 'ninja', 'hunter', 'soccer', 'hockey',
  'computer', 'internet', 'chocolate', 'cookie', 'starwars', 'pokemon',
]

function normalizeForWeaknessCheck(password: string): string {
  return password
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z]/g, '')
}

// Review Finding 8: the same minimum as Supabase (config.toml / dashboard)
// and the mobile app. Existing passwords keep working; the new minimum
// applies the next time a password is set.
export const PASSWORD_MIN_LENGTH = 12

export interface UserContext {
  name?: string | null
  email?: string | null
}

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
}

export function validatePassword(
  password: string,
  ctx: UserContext = {}
): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH)
    errors.push(`At least ${PASSWORD_MIN_LENGTH} characters long`)
  if (!/[A-Z]/.test(password))
    errors.push('At least one uppercase letter')
  if (!/[a-z]/.test(password))
    errors.push('At least one lowercase letter')
  if (!/[0-9]/.test(password))
    errors.push('At least one number')
  if (!/[!@#$%^&*]/.test(password))
    errors.push('At least one special character (!@#$%^&*)')

  const lower = password.toLowerCase()

  if (ctx.name) {
    const parts = ctx.name.toLowerCase().split(/\s+/).filter(p => p.length > 2)
    if (parts.some(part => lower.includes(part)))
      errors.push('Cannot contain your name')
  }

  if (ctx.email) {
    const local = ctx.email.split('@')[0].toLowerCase()
    if (local.length > 2 && lower.includes(local))
      errors.push('Cannot contain your email address')
  }

  // Flag if a common root makes up at least half the letters in the
  // password, rather than any substring match — so a long passphrase that
  // merely contains a dictionary word (e.g. "MyGreatSecretPlan99!") isn't
  // penalized the same as a password that's basically just that word
  // dressed up with digits/punctuation (e.g. "Secret123!").
  const normalized = normalizeForWeaknessCheck(password)
  const isCommon = normalized.length > 0 && COMMON_PASSWORD_BASES.some(
    base => normalized.includes(base) && base.length / normalized.length >= 0.5
  )
  if (isCommon)
    errors.push('This password is too commonly used — choose a more unique one')

  return { valid: errors.length === 0, errors }
}

// For real-time UI feedback — checks rules only (no name/email context needed)
export function checkPasswordRules(password: string) {
  return {
    minLength:    password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber:    /[0-9]/.test(password),
    hasSpecial:   /[!@#$%^&*]/.test(password),
  }
}
