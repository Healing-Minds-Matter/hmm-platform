-- Documents now also accept Excel spreadsheets and images (alongside PDF,
-- Word and PowerPoint) — see lib/resource-file-types.ts. The `resources`
-- bucket only allowed the file types listed in 20260810000000, so Storage
-- itself refused Excel and image uploads. This adds them; everything already
-- allowed stays allowed. Safe to run more than once.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  -- Videos
  'video/mp4', 'video/webm', 'video/quicktime',
  -- Documents: PDF, Word, PowerPoint, plain text (unchanged)
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  -- Documents: Excel (new)
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  -- Documents: images (new)
  'image/png', 'image/jpeg', 'image/gif', 'image/webp'
]
WHERE id = 'resources';
