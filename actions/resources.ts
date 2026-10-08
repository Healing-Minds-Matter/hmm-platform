'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { isAllowedCategory, isResourceCategory } from '@/lib/resource-categories'
import { todayDateString } from '@/lib/org-date'
import { checkResourceFile } from '@/lib/resource-file-types'

const BUCKET = 'resources'
// No separate "Other" type (Story 4.1): other file formats are Documents —
// see lib/resource-file-types.ts. The database enum still contains 'other',
// but nothing can create one any more and none exist.
const RESOURCE_TYPES = ['video', 'article', 'document'] as const
type ResourceType = (typeof RESOURCE_TYPES)[number]

// Matches this Supabase project's actual configured Storage file size limit
// (confirmed via the Management API's /config/storage endpoint) — a hard
// platform ceiling, not something raisable from application code alone.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export type ResourceActionState = { error?: string; success?: boolean } | null

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

// ---------------------------------------------------------------------------
// Direct-to-Storage uploads
// ---------------------------------------------------------------------------
// Files go straight from the browser to Supabase Storage instead of through
// this server action: the live site runs on Vercel, which rejects any request
// body over ~4.5MB before our code even runs, so a 5.5MB video could never be
// uploaded through the form itself (bodySizeLimit in next.config.ts only
// raises Next.js's own limit, not Vercel's platform one).
//
//  1. The form calls createResourceUploadAction() for a one-time signed upload
//     URL (Super Admins only, files up to 50MB).
//  2. The browser uploads the file to that URL (lib/resource-upload.ts).
//  3. The form is then saved with just the file's storage path in
//     `uploaded_path`, which verifyUploadedPath() checks before it's used.

const UPLOADED_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[A-Za-z0-9]{1,10})?$/

export async function createResourceUploadAction(input: {
  fileName: string
  fileSize: number
  resourceType: string
}): Promise<{ path: string; token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Please sign in again.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return { error: 'Only Super Admins can upload resources.' }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) return { error: 'The selected file is empty.' }
  if (input.fileSize > MAX_FILE_SIZE_BYTES) {
    return { error: `File is too large (${(input.fileSize / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 50MB.` }
  }
  const fileTypeError = checkResourceFile(input.resourceType, input.fileName)
  if (fileTypeError) return { error: fileTypeError }

  const rawExt = input.fileName.includes('.') ? input.fileName.split('.').pop() ?? '' : ''
  const ext = /^[A-Za-z0-9]{1,10}$/.test(rawExt) ? rawExt.toLowerCase() : ''
  const path = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: 'Could not start the upload. Please try again.' }
  return { path: data.path, token: data.token }
}

// An uploaded_path comes from the browser, so it's only trusted if it's in
// the exact form createResourceUploadAction() issues, the file really exists
// in Storage, it's within the size limit, and no other resource already
// uses it (so a resource can't be pointed at — or later delete — another
// resource's file).
async function verifyUploadedPath(path: string): Promise<string | null> {
  if (!UPLOADED_PATH_PATTERN.test(path)) return 'The uploaded file reference is invalid. Please upload the file again.'

  const admin = createAdminClient()
  const { data: info, error } = await admin.storage.from(BUCKET).info(path)
  if (error || !info) return 'The uploaded file could not be found. Please upload it again.'
  if (typeof info.size === 'number' && info.size > MAX_FILE_SIZE_BYTES) return 'File is too large. Maximum allowed is 50MB.'

  const { count } = await admin.from('resources').select('id', { count: 'exact', head: true }).eq('content_url', path)
  if (count) return 'The uploaded file reference is invalid. Please upload the file again.'
  return null
}

// Removes a just-uploaded file when the save it was meant for fails, so a
// failed attempt doesn't leave an orphaned file in Storage (the form keeps
// the file selected and uploads it again on retry). Only ever deletes a
// path that passes verifyUploadedPath(), i.e. one no resource is using.
async function discardUpload(path: string | null) {
  if (path && !(await verifyUploadedPath(path))) await deleteResourceFile(path)
}

// Video length is measured in the browser (lib/resource-upload.ts) and sent
// as duration_seconds. Display metadata only — anything implausible is
// dropped rather than rejected, same as the old server-side extraction.
function parseDurationSeconds(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 24 * 60 * 60 ? Math.round(n) : null
}

async function deleteResourceFile(path: string) {
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([path])
}

function readCommonFields(formData: FormData) {
  const title           = (formData.get('title') as string | null)?.trim()
  const description     = (formData.get('description') as string | null)?.trim() || null
  const type            = formData.get('type') as string | null
  const category         = (formData.get('category') as string | null)?.trim() || null
  const publicationDate = formData.get('publication_date') as string | null
  const contentUrl      = (formData.get('content_url') as string | null)?.trim() || null
  const contentText     = (formData.get('content_text') as string | null)?.trim() || null
  // Set by the browser after uploading the chosen file directly to Storage —
  // see "Direct-to-Storage uploads" above. The file itself never comes here.
  const uploadedPath    = (formData.get('uploaded_path') as string | null)?.trim() || null
  const durationSeconds = parseDurationSeconds(formData.get('duration_seconds'))

  return { title, description, type, category, publicationDate, contentUrl, contentText, uploadedPath, durationSeconds }
}

function validate({
  title, type, publicationDate, contentUrl, contentText, uploadedPath,
}: ReturnType<typeof readCommonFields>): string | null {
  if (!title) return 'Title is required.'
  if (!type || !RESOURCE_TYPES.includes(type as ResourceType)) return 'A valid resource type is required.'
  if (!publicationDate) return 'Publication date is required.'

  if (type === 'article') {
    if (!contentText && !contentUrl) return 'Provide article content or an external link.'
  } else {
    if (!uploadedPath && !contentUrl) return 'Upload a file or provide an external URL.'
  }

  return null
}

export async function createResourceAction(
  _prev: ResourceActionState,
  formData: FormData
): Promise<ResourceActionState> {
  const fields = readCommonFields(formData)
  // The Create New Resource modal (Figma node 54:17908) has no publication-date
  // field — default to today, same as the real moment of creation/publication.
  // The older full-page create form still sends an explicit date, which wins.
  if (!fields.publicationDate) fields.publicationDate = new Date().toISOString().slice(0, 10)

  const fail = async (error: string): Promise<ResourceActionState> => {
    await discardUpload(fields.uploadedPath)
    return { error }
  }

  const validationError = validate(fields)
  if (validationError) return fail(validationError)
  if (!isResourceCategory(fields.category)) return fail('Choose a category from the list.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let contentUrl = fields.contentUrl
  let durationSeconds: number | null = null
  const hasFile = !!fields.uploadedPath

  if (fields.uploadedPath) {
    const fileTypeError = checkResourceFile(fields.type, fields.uploadedPath)
    if (fileTypeError) return fail(fileTypeError)
    const uploadError = await verifyUploadedPath(fields.uploadedPath)
    if (uploadError) return { error: uploadError }
    contentUrl = fields.uploadedPath
    durationSeconds = fields.type === 'video' ? fields.durationSeconds : null
  }

  // "intent" is set by whichever footer button submitted the form (Save as
  // Draft vs. Publish Resource) — absent on the older full-page form, which
  // always publishes immediately, matching its pre-existing behavior.
  const intent = formData.get('intent') as string | null
  const status = intent === 'draft' ? 'draft' : 'published'
  const visibleToChampions  = formData.get('visible_to_champions')  ? true : false
  const visibleToGatekeepers = formData.get('visible_to_gatekeepers') ? true : false
  const estimatedCompletion = (formData.get('estimated_completion') as string | null)?.trim() || null
  // The audience checkboxes only exist in the new modal — when absent (the
  // older full-page form), default both to true so behavior for that path is
  // unchanged from before these columns existed.
  const hasAudienceFields = formData.has('visible_to_champions') || formData.has('visible_to_gatekeepers') || formData.has('intent')

  const { data: resource, error } = await supabase
    .from('resources')
    .insert({
      title: fields.title,
      description: fields.description,
      type: fields.type,
      category: fields.category,
      publication_date: fields.publicationDate,
      content_url: contentUrl,
      content_text: fields.type === 'article' ? fields.contentText : null,
      created_by: user.id,
      status,
      estimated_completion: estimatedCompletion,
      duration_seconds: durationSeconds,
      visible_to_champions: hasAudienceFields ? visibleToChampions : true,
      visible_to_gatekeepers: hasAudienceFields ? visibleToGatekeepers : true,
    })
    .select('id')
    .single()

  if (error) {
    if (hasFile && contentUrl) await deleteResourceFile(contentUrl)
    return { error: error.message }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'resource.created',
    entityType: 'resource',
    entityId: resource.id,
    details: { title: fields.title, type: fields.type, status },
  })

  revalidatePath('/super-admin/resources')

  // No redirect() here: this action is invoked from inside the Create New
  // Resource modal (an intercepted route). redirect() from within a server
  // action called from an intercepted route can leave the @modal slot stuck
  // open even though the URL changes underneath it — same bug and fix as
  // the Champions create/edit modals. The form closes itself client-side on
  // success instead (see create-resource-form.tsx).
  return { success: true }
}

export async function updateResourceAction(
  _prev: ResourceActionState,
  formData: FormData
): Promise<ResourceActionState> {
  const resourceId = formData.get('resource_id') as string
  const previousContentUrl = (formData.get('previous_content_url') as string | null) || null
  const fields = readCommonFields(formData)
  const hasFile = !!fields.uploadedPath
  const fail = async (error: string): Promise<ResourceActionState> => {
    await discardUpload(fields.uploadedPath)
    return { error }
  }

  // The External URL field is intentionally left blank in the edit form when the
  // resource's existing content is a stored file (it only pre-fills for http(s) URLs).
  // So "no new file, no URL typed" means "leave the existing file alone", not "remove it".
  // Only for a stored file, though: when the existing content is an external link,
  // the field was pre-filled, so an empty field means the user deliberately cleared
  // it — that must fail validation below, not silently restore the old link while
  // reporting success.
  if (
    fields.type !== 'article' && !hasFile && !fields.contentUrl &&
    previousContentUrl && !isExternalUrl(previousContentUrl)
  ) {
    fields.contentUrl = previousContentUrl
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Stored values are read from the database, not the form: the category (so
  // only a genuinely unchanged older category is let through) and the
  // status/date (for the publishing rules below).
  const { data: existing } = await supabase
    .from('resources')
    .select('category, status, publication_date')
    .eq('id', resourceId)
    .single()
  if (!existing) return fail('Resource not found.')

  // Draft vs. published comes from the footer button used: a draft has
  // "Save as Draft" (intent=draft) and "Publish" (intent=publish); a
  // published resource has "Save Changes" (intent=publish) and "Move to
  // Draft" (intent=draft). Saving never changes the status by itself.
  const intent = formData.get('intent') as string | null
  const newStatus: 'draft' | 'published' =
    intent === 'draft' ? 'draft' : intent === 'publish' ? 'published' : existing.status
  const publishDateError = resolvePublicationDate(fields, newStatus, existing)
  if (publishDateError) return fail(publishDateError)

  const validationError = validate(fields)
  if (validationError) return fail(validationError)

  if (!isAllowedCategory(fields.category, existing.category ?? null)) {
    return fail('Choose a category from the list.')
  }

  let contentUrl = fields.contentUrl
  // Only set when a NEW file is uploaded this request — omitted from the
  // update payload entirely otherwise, so an existing real duration (or an
  // existing null, if extraction failed originally) is left untouched
  // rather than being overwritten just because some other field changed.
  let durationSeconds: number | null | undefined

  if (fields.uploadedPath) {
    const fileTypeError = checkResourceFile(fields.type, fields.uploadedPath)
    if (fileTypeError) return fail(fileTypeError)
    const uploadError = await verifyUploadedPath(fields.uploadedPath)
    if (uploadError) return { error: uploadError }
    contentUrl = fields.uploadedPath
    durationSeconds = fields.type === 'video' ? fields.durationSeconds : null
  }

  const { error } = await supabase
    .from('resources')
    .update({
      title: fields.title,
      description: fields.description,
      type: fields.type,
      category: fields.category,
      publication_date: fields.publicationDate,
      content_url: contentUrl,
      content_text: fields.type === 'article' ? fields.contentText : null,
      status: newStatus,
      ...(hasFile ? { duration_seconds: durationSeconds } : {}),
    })
    .eq('id', resourceId)

  if (error) {
    if (hasFile && contentUrl) await deleteResourceFile(contentUrl)
    return { error: error.message }
  }

  // Replaced a stored file with a new file, a new URL, or removed it — remove the old
  // file from storage whenever the resource no longer points at it.
  if (previousContentUrl && !isExternalUrl(previousContentUrl) && contentUrl !== previousContentUrl) {
    await deleteResourceFile(previousContentUrl)
  }

  await writeAuditLog({
    actorId: user.id,
    action:
      existing.status === 'draft' && newStatus === 'published' ? 'resource.published'
      : existing.status === 'published' && newStatus === 'draft' ? 'resource.unpublished'
      : 'resource.updated',
    entityType: 'resource',
    entityId: resourceId,
    details: { title: fields.title, type: fields.type, status: newStatus, publication_date: fields.publicationDate },
  })

  revalidatePath('/super-admin/resources')
  revalidatePath('/champion/resources')
  return { success: true }
}

// The publication date is the day a published resource goes live (a future
// date schedules it). Fills in or checks fields.publicationDate in place and
// returns an error message, or null.
//  - Draft: the date isn't used yet; an empty box keeps the stored value
//    (the column can't be empty).
//  - Publishing: empty means today. It can't be in the past — except an
//    already-published resource may keep its original, unchanged date.
function resolvePublicationDate(
  fields: ReturnType<typeof readCommonFields>,
  newStatus: 'draft' | 'published',
  existing: { status: string; publication_date: string }
): string | null {
  if (newStatus === 'draft') {
    if (!fields.publicationDate) fields.publicationDate = existing.publication_date
    return null
  }

  const today = todayDateString()
  if (!fields.publicationDate) fields.publicationDate = today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.publicationDate)) return 'Enter a valid publication date.'

  const keepsOriginalDate =
    existing.status === 'published' && fields.publicationDate === existing.publication_date
  if (!keepsOriginalDate && fields.publicationDate < today) {
    return "Publication date can't be in the past. Leave it empty to publish today, or choose a future date to schedule it."
  }
  return null
}

export async function deleteResourceAction(formData: FormData) {
  const resourceId = formData.get('resource_id') as string
  const contentUrl = (formData.get('content_url') as string | null) || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('resources').delete().eq('id', resourceId)
  if (error) return

  if (contentUrl && !isExternalUrl(contentUrl)) {
    await deleteResourceFile(contentUrl)
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'resource.deleted',
    entityType: 'resource',
    entityId: resourceId,
  })

  revalidatePath('/super-admin/resources')
}
