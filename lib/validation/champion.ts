import { z } from 'zod'

// Server-side schema for the Create Champion form. Only these fields are read
// from the request; anything else the client sends (role, is_active, ...) is
// ignored. Phone is checked separately by lib/phone.ts (its own rules and
// messages).

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const createChampionSchema = z.object({
  full_name: z.preprocess(text, z.string()
    .min(1, 'Full name is required.')
    .max(200, 'Full name must be 200 characters or fewer.')),
  email: z.preprocess(v => text(v).toLowerCase(), z.string()
    .min(1, 'Email is required.')
    .max(254, 'Email is too long.')
    .pipe(z.email('Enter a valid email address.'))),
  title: z.preprocess(v => text(v) || null, z.string()
    .max(100, 'Title must be 100 characters or fewer.')
    .nullable()),
  club_id: z.preprocess(text, z.string()
    .min(1, 'Club assignment is required.')
    .pipe(z.uuid('Select a valid club.'))),
})

export type CreateChampionInput = z.infer<typeof createChampionSchema>

/** Parses the form; on failure returns the first error and which field it belongs to. */
export function parseCreateChampion(formData: FormData):
  | { ok: true; value: CreateChampionInput }
  | { ok: false; field: keyof CreateChampionInput; error: string } {
  const result = createChampionSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    title: formData.get('title'),
    club_id: formData.get('club_id'),
  })
  if (result.success) return { ok: true, value: result.data }
  const issue = result.error.issues[0]
  return { ok: false, field: issue.path[0] as keyof CreateChampionInput, error: issue.message }
}
