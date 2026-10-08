'use client'

import { startTransition, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createResourceUploadAction } from '@/actions/resources'
import { checkResourceFile } from '@/lib/resource-file-types'

const BUCKET = 'resources'
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

// Submit handler for the Create/Edit Resource forms. A chosen file is
// uploaded from the browser straight to Supabase Storage (using a one-time
// signed URL from createResourceUploadAction), and only its storage path is
// sent to the save action — the live site's host, Vercel, rejects request
// bodies over ~4.5MB, so sending the file through the form can't work for
// real videos. See "Direct-to-Storage uploads" in actions/resources.ts.
//
// Like useSubmitWithoutReset, it never lets React auto-reset the form, so a
// failed save keeps everything the user entered (including the chosen file).
export function useResourceSubmit(formAction: (formData: FormData) => void) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    setUploadError(null)

    const file = formData.get('file')
    formData.delete('file')

    if (file instanceof File && file.size > 0) {
      const fileTypeError = checkResourceFile(String(formData.get('type') ?? ''), file.name)
      if (fileTypeError) {
        setUploadError(fileTypeError)
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 50MB.`)
        return
      }

      setUploading(true)
      try {
        const ticket = await createResourceUploadAction({
          fileName: file.name,
          fileSize: file.size,
          resourceType: String(formData.get('type') ?? ''),
        })
        if ('error' in ticket) throw new Error(ticket.error)

        const { error } = await createClient()
          .storage.from(BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || undefined })
        if (error) throw new Error(`Upload failed: ${error.message}`)

        formData.set('uploaded_path', ticket.path)
        if (file.type.startsWith('video/')) {
          const seconds = await measureVideoDuration(file)
          if (seconds) formData.set('duration_seconds', String(seconds))
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
        return
      } finally {
        setUploading(false)
      }
    }

    startTransition(() => formAction(formData))
  }

  return { submit, uploading, uploadError }
}

// Reads a video's length from its metadata in the browser. Resolves null
// (never rejects) for anything the browser can't read, e.g. an unsupported
// codec — the length is display-only and must never block a save.
function measureVideoDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (value: number | null) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), 10_000)
    video.preload = 'metadata'
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null)
    video.onerror = () => done(null)
    video.src = url
  })
}
