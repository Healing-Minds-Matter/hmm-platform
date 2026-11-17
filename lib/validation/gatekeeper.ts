import { z } from 'zod'
import { parsePhone } from '@/lib/phone'

// Review Finding 13j: one server-side schema for a new Gatekeeper, used by
// the single Add Gatekeeper form AND every row of the bulk CSV upload. Only
// these fields are read; anything else sent (role, is_active, ...) is
// ignored. The club is checked again on the server against the caller's
// scope (a Champion's own club, always) and the database (exists, active).

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
// Letters (any script, so Sinhala and Tamil names work), spaces and . ' -
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u

export const LANGUAGES = ['en', 'si', 'ta'] as const

export const newGatekeeperSchema = z.object({
  full_name: z.preprocess(v => text(v).replace(/\s+/g, ' '), z.string()
    .min(1, 'Full name is required.')
    .max(200, 'Full name must be 200 characters or fewer.')
    .regex(NAME_RE, 'Full name can only contain letters, spaces, full stops, apostrophes and hyphens.')),
  email: z.preprocess(v => text(v).toLowerCase(), z.string()
    .min(1, 'Email is required.')
    .max(254, 'Email is too long.')
    .pipe(z.email('Enter a valid email address, e.g. name@example.com.'))),
  phone: z.preprocess(text, z.string().min(1, 'Phone number is required.'))
    .transform((raw, ctx) => {
      const parsed = parsePhone(raw)
      if (!parsed.ok) {
        ctx.addIssue({ code: 'custom', message: parsed.error })
        return z.NEVER
      }
      return parsed.value!
    }),
  // Empty for a Champion (their own club is used); a Super Admin must give one.
  club_id: z.preprocess(v => text(v) || null, z.uuid('Select a valid club (club_id must be the club’s ID).').nullable()),
  preferred_language: z.preprocess(v => text(v) || 'en', z.enum(LANGUAGES, 'Choose English, Sinhala or Tamil.')),
})

export type NewGatekeeperInput = z.infer<typeof newGatekeeperSchema>
export type NewGatekeeperField = keyof NewGatekeeperInput

export type ParsedGatekeeper =
  | { ok: true; value: NewGatekeeperInput }
  | { ok: false; field: NewGatekeeperField; error: string }

/** Checks one new Gatekeeper (a form or a CSV row). Returns the first problem and its field. */
export function parseNewGatekeeper(input: Partial<Record<NewGatekeeperField, unknown>>): ParsedGatekeeper {
  const result = newGatekeeperSchema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  const issue = result.error.issues[0]
  return { ok: false, field: issue.path[0] as NewGatekeeperField, error: issue.message }
}
