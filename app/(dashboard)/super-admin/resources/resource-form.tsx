'use client'

import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { useResourceSubmit } from '@/hooks/use-resource-submit'
import { useRouter } from 'next/navigation'
import { updateResourceAction, type ResourceActionState } from '@/actions/resources'
import { RESOURCE_CATEGORIES, isResourceCategory } from '@/lib/resource-categories'
import { todayDateString } from '@/lib/org-date'
import { RESOURCE_FILE_RULES } from '@/lib/resource-file-types'
import { formatPublicationDate, needsRescheduleConfirmation, publicationMessage } from './publication-message'

interface ResourceValues {
  id: string
  title: string
  description: string | null
  type: string
  category: string | null
  publication_date: string
  content_url: string | null
  content_text: string | null
  status: string
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-[13.5px] text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]'
const labelClass = 'block text-[13px] font-medium text-[#0F172A]'

// Edit-only — Create goes through CreateResourceForm (matches the real
// Figma "Create New Resource" modal). No Figma edit-modal design exists, so
// this keeps its own simpler field layout — only the surrounding chrome
// (header/close/footer) matches the app's shared modal-card convention.
export function EditResourceForm({ resource, onClose }: { resource: ResourceValues; onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/resources'))
  const [state, formAction, isPending] = useActionState<ResourceActionState, FormData>(updateResourceAction, null)
  const { submit, uploading, uploadError } = useResourceSubmit(formAction)
  const errorMessage = uploadError ?? state?.error
  const [type, setType] = useState(resource.type)
  const isDraft = resource.status === 'draft'
  const today = todayDateString()
  const statusLabel = isDraft ? 'Draft' : resource.publication_date > today ? 'Scheduled' : 'Published'

  // A draft's stored date is only a placeholder (the column can't be empty),
  // so its box starts empty — the real date is set when publishing.
  const [pubDate, setPubDate] = useState(isDraft ? '' : resource.publication_date)
  const pubMessage = publicationMessage(isDraft, resource.publication_date, pubDate, today)

  // Moving a live resource to a future date hides it from users right away,
  // so "Save Changes" asks for confirmation first in that one case.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmedRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const publishButtonRef = useRef<HTMLButtonElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const isPublishIntent = submitter?.value === 'publish'
    if (
      isPublishIntent && !confirmedRef.current &&
      needsRescheduleConfirmation(isDraft, resource.publication_date, pubDate, today)
    ) {
      event.preventDefault()
      setConfirmOpen(true)
      return
    }
    confirmedRef.current = false
    submit(event)
  }

  function confirmReschedule() {
    setConfirmOpen(false)
    confirmedRef.current = true
    formRef.current?.requestSubmit(publishButtonRef.current ?? undefined)
  }

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <h1 className="text-[18px] font-bold leading-[24px] text-[#0F172A]">Edit Resource</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.44px] ${
              statusLabel === 'Draft' ? 'bg-[#FEF3C7] text-[#92400E]'
              : statusLabel === 'Scheduled' ? 'bg-[#EFF4FF] text-[#1E4BB8]'
              : 'bg-[#E6FFE7] text-[#16A34A]'
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/x-close.svg" alt="" width={11.67} height={11.67} />
        </button>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <input type="hidden" name="resource_id" value={resource.id} />
        <input type="hidden" name="previous_content_url" value={resource.content_url ?? ''} />

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-[#F8FAFC] p-6">
          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700" role="alert">
              {errorMessage}
            </div>
          )}

          <div>
            <label htmlFor="title" className={labelClass}>
              Title <span className="text-[#DC2626]">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={resource.title}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={resource.description ?? ''}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className={labelClass}>
                Type <span className="text-[#DC2626]">*</span>
              </label>
              <select
                id="type"
                name="type"
                required
                value={type}
                onChange={e => setType(e.target.value)}
                className={inputClass}
              >
                <option value="video">Video</option>
                <option value="article">Article</option>
                <option value="document">Document</option>
              </select>
            </div>
            <div>
              <label htmlFor="category" className={labelClass}>
                Category <span className="text-[#DC2626]">*</span>
              </label>
              <select
                id="category"
                name="category"
                required
                defaultValue={resource.category ?? ''}
                className={inputClass}
              >
                <option value="" disabled>Select a category</option>
                {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                {/* A category from before the fixed list existed can be kept as
                    is (the server allows it only while unchanged). */}
                {resource.category && !isResourceCategory(resource.category) && (
                  <option value={resource.category}>{resource.category} (older category)</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="publication_date" className={labelClass}>
              Publication Date {!isDraft && <span className="text-[#DC2626]">*</span>}
            </label>
            <input
              id="publication_date"
              name="publication_date"
              type="date"
              required={!isDraft}
              value={pubDate}
              onChange={e => {
                setPubDate(e.target.value)
                // Same wording as the message below, instead of the browser's own.
                const message = publicationMessage(isDraft, resource.publication_date, e.target.value, today)
                e.currentTarget.setCustomValidity(message?.tone === 'error' ? message.text : '')
              }}
              className={inputClass}
            />
            {/* Spells out what saving will do to the resource's visibility,
                updated as the date changes (see publication-message.ts). */}
            {pubMessage && (
              <p
                role={pubMessage.tone === 'info' ? undefined : 'alert'}
                className={`mt-1.5 rounded-lg px-3 py-2 text-[12px] leading-[18px] ${
                  pubMessage.tone === 'warning' ? 'bg-amber-50 text-[#92400E]'
                  : pubMessage.tone === 'error' ? 'bg-red-50 text-[#DC2626]'
                  : 'bg-[#EFF4FF] text-[#1E4BB8]'
                }`}
              >
                {pubMessage.tone === 'warning' && '⚠ '}{pubMessage.text}
              </p>
            )}
            {isDraft && !pubDate && (
              <p className="mt-1 text-[11px] text-[#94A3B8]">Or choose a future date to schedule it.</p>
            )}
          </div>

          {type === 'article' ? (
            <>
              <div>
                <label htmlFor="content_text" className={labelClass}>
                  Article Content
                </label>
                <textarea
                  id="content_text"
                  name="content_text"
                  rows={6}
                  defaultValue={resource.content_text ?? ''}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="content_url" className={labelClass}>
                  External Link
                </label>
                <input
                  id="content_url"
                  name="content_url"
                  type="url"
                  placeholder="https://…"
                  defaultValue={resource.content_url && /^https?:\/\//i.test(resource.content_url) ? resource.content_url : ''}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[12px] text-[#64748B]">
                  Provide article content, an external link, or both.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="file" className={labelClass}>
                  Upload File
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept={(type === 'video' ? RESOURCE_FILE_RULES.video : RESOURCE_FILE_RULES.document).accept}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[12px] text-[#64748B]">
                  Supports {(type === 'video' ? RESOURCE_FILE_RULES.video : RESOURCE_FILE_RULES.document).label} (Max 50MB).
                </p>
                {resource.content_url && !/^https?:\/\//i.test(resource.content_url) && (
                  <p className="mt-1.5 text-[12px] text-[#64748B]">
                    A file is already attached. Uploading a new one replaces it.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="content_url" className={labelClass}>
                  External URL
                </label>
                <input
                  id="content_url"
                  name="content_url"
                  type="url"
                  placeholder="https://…"
                  defaultValue={resource.content_url && /^https?:\/\//i.test(resource.content_url) ? resource.content_url : ''}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[12px] text-[#64748B]">
                  Upload a file or link to an external URL (e.g. YouTube).
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
          {/* Draft: Save as Draft / Publish. Published: Move to Draft / Save
              Changes. Which button is used decides the status (see
              updateResourceAction) — saving alone never publishes a draft. */}
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={uploading || isPending}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0] disabled:opacity-60"
          >
            {isDraft ? 'Save as Draft' : 'Move to Draft'}
          </button>
          <button
            ref={publishButtonRef}
            type="submit"
            name="intent"
            value="publish"
            disabled={uploading || isPending}
            className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {uploading ? 'Uploading file…' : isPending ? 'Saving…' : isDraft ? 'Publish' : 'Save Changes'}
          </button>
        </div>
      </form>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-confirm-title"
        >
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <h2 id="reschedule-confirm-title" className="text-[16px] font-bold text-[#0F172A]">
              Hide this resource until {formatPublicationDate(pubDate)}?
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-[#475569]">
              It&apos;s currently visible to Champions and Gatekeepers. If you continue, they won&apos;t see it
              until {formatPublicationDate(pubDate)}.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReschedule}
                className="flex h-10 items-center rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#E09B0F]"
              >
                Yes, reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
