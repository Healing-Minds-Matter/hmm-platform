// Which file formats each resource type accepts — one list, used by the file
// pickers (Create/Edit Resource) and checked again on the server, so a file
// can't be saved under the wrong type even if the picker is bypassed.
//
// Per Story 4.1 there are three resource types: Video, Article (text or a
// link, no file) and Document — "PDF, Word, or other supported format". There
// is no separate "Other" type: other formats (PowerPoint, Excel, images) are
// Documents.

type FileRule = {
  extensions: readonly string[]
  // For the <input type="file" accept="…"> attribute.
  accept: string
  // Shown under the picker.
  label: string
}

const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp'] as const

export const RESOURCE_FILE_RULES: Record<'video' | 'document', FileRule> = {
  video: {
    extensions: ['mp4'],
    accept: 'video/mp4,.mp4',
    label: 'MP4',
  },
  document: {
    extensions: DOCUMENT_EXTENSIONS,
    accept: DOCUMENT_EXTENSIONS.map(ext => `.${ext}`).join(','),
    label: 'PDF, Word, PowerPoint, Excel or an image (PNG, JPG, GIF, WebP)',
  },
}

export function fileExtension(name: string): string {
  return name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
}

// Returns a user-facing error, or null when the file suits the resource type.
export function checkResourceFile(type: string | null | undefined, fileName: string): string | null {
  const rule = type === 'video' || type === 'document' ? RESOURCE_FILE_RULES[type] : null
  if (!rule) return 'Files can only be uploaded for Video or Document resources.'
  if (!rule.extensions.includes(fileExtension(fileName))) {
    return type === 'video'
      ? `Video files must be ${rule.label}.`
      : `Documents must be ${rule.label}.`
  }
  return null
}
