'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useResourceSubmit } from '@/hooks/use-resource-submit'
import { useRouter } from 'next/navigation'
import { createResourceAction } from '@/actions/resources'
import { RESOURCE_CATEGORIES } from '@/lib/resource-categories'
import { RESOURCE_FILE_RULES } from '@/lib/resource-file-types'

const RESOURCE_TYPE_TABS = [
  { value: 'video', label: 'Video', icon: '/icons/resource-tab-video.svg', iconClass: 'h-[15px] w-[15px]' },
  { value: 'article', label: 'Article', icon: '/icons/resource-tab-article.svg', iconClass: 'h-3 w-[16.5px]' },
  { value: 'document', label: 'Document', icon: '/icons/resource-tab-document.svg', iconClass: 'h-[15px] w-3' },
]

function CheckboxRow({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[13px] font-medium text-[#0F172A]">
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/checkbox-unchecked.svg" alt="" className="absolute inset-0 h-full w-full peer-checked:opacity-0" />
        <span className="absolute inset-0 hidden items-center justify-center rounded-[2.5px] bg-[#0075FF] peer-checked:flex">
          <svg viewBox="0 0 12 10" className="h-[7px] w-2" fill="none" aria-hidden="true">
            <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      {label}
    </label>
  )
}

function FileDropZone({ type }: { type: string }) {
  const rule = type === 'video' ? RESOURCE_FILE_RULES.video : RESOURCE_FILE_RULES.document
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file && inputRef.current) {
          const dt = new DataTransfer()
          dt.items.add(file)
          inputRef.current.files = dt.files
          setFileName(file.name)
        }
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center transition-colors ${
        isDragging ? 'bg-[#EFF4FF] ring-2 ring-[#1E4BB8]' : 'bg-[#F8FAFC] hover:bg-slate-100'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={rule.accept}
        className="hidden"
        onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cloud-upload.svg" alt="" width={18.33} height={13.33} />
      </span>
      <p className="text-[12px] font-semibold tracking-[0.24px] text-[#0F172A]">
        {fileName ?? 'Or drag & drop source file'}
      </p>
      <p className="text-[12px] text-[#64748B]">Supports {rule.label} (Max 50MB)</p>
    </div>
  )
}

export function CreateResourceForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const close = onClose ?? (() => router.push('/super-admin/resources'))
  const [state, formAction, isPending] = useActionState(createResourceAction, null)
  const { submit, uploading, uploadError } = useResourceSubmit(formAction)
  const busy = uploading || isPending
  const errorMessage = uploadError ?? state?.error
  const [type, setType] = useState('video')

  useEffect(() => {
    if (state?.success) close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="mx-auto flex max-h-[90vh] w-full max-w-[672px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] font-[family-name:var(--font-inter)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-[3px]">
          <h1 className="text-[18px] font-bold leading-7 tracking-[-0.22px] text-[#0F172A]">Create New Resource</h1>
          <p className="max-w-[480px] text-[13px] leading-[18px] text-[#475569]">
            Upload and publish learning materials, clinical guidelines, or video trainings across the platform.
          </p>
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

      <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
        <input type="hidden" name="type" value={type} />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F8FAFC] p-6">
          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">Select Resource Type</h2>

            <div className="flex gap-1.5 rounded-xl bg-[#F1F5F9] p-1">
              {RESOURCE_TYPE_TABS.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setType(tab.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold tracking-[0.24px] transition-colors ${
                    type === tab.value ? 'bg-white text-[#003495] shadow-sm' : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tab.icon} alt="" className={tab.iconClass} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Resource Title <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                autoComplete="off"
                placeholder="e.g. QPR Gatekeeper Core Intervention Protocol"
                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="category" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Category <span className="text-[#DC2626]">*</span>
                </label>
                <div className="relative">
                  <select
                    id="category"
                    name="category"
                    required
                    defaultValue=""
                    className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 pr-9 text-sm text-[#0F172A] invalid:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  >
                    <option value="" disabled>Select a category</option>
                    {RESOURCE_CATEGORIES.map(c => (
                      <option key={c} value={c} className="text-[#0F172A]">{c}</option>
                    ))}
                  </select>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/chevron-down.svg" alt="" className="pointer-events-none absolute right-3.5 top-1/2 h-[6px] w-[9px] -translate-y-1/2" />
                </div>
              </div>
              <div>
                <label htmlFor="estimated_completion" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                  Estimated Completion
                </label>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/clock-outline.svg" alt="" width={15} height={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="estimated_completion"
                    name="estimated_completion"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. 15 min video"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
              </div>
            </div>

            {type === 'article' ? (
              <>
                <div>
                  <label htmlFor="content_text" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Article Content
                  </label>
                  <textarea
                    id="content_text"
                    name="content_text"
                    rows={4}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <div>
                  <label htmlFor="content_url_article" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    External Link
                  </label>
                  <input
                    id="content_url_article"
                    name="content_url"
                    type="url"
                    placeholder="https://…"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                  <p className="mt-1.5 text-[11px] text-[#94A3B8]">
                    Provide article content, an external link, or both.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="content_url" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                    Video Link or Media Upload <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    id="content_url"
                    name="content_url"
                    type="url"
                    placeholder="https://vimeo.com/…"
                    className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
                  />
                </div>
                <FileDropZone type={type} />
              </>
            )}

            <div>
              <label htmlFor="description" className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">
                Description Summary <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
              />
            </div>

            {/* Draft vs. published is decided only by the footer button used
                (Save as Draft / Publish Resource). A "Publication Status"
                radio group that used to sit here was decorative (the server
                never read it), so choosing "Save as Draft" there and then
                clicking Publish Resource published the resource anyway. */}
            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#64748B]">
                Target Audience &amp; Visibility
              </h3>
              <div className="flex flex-col gap-2 rounded-xl bg-[#F8FAFC] p-3">
                <CheckboxRow name="visible_to_champions" label="Champions (Web Portal & Admin Suite)" defaultChecked />
                <CheckboxRow name="visible_to_gatekeepers" label="Gatekeepers (Mobile Field App)" defaultChecked />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="flex h-10 items-center rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-[#E2E8F0] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/save-draft-icon.svg" alt="" width={10.5} height={13.5} />
            Save as Draft
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#F4AC1E] px-5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/publish-upload-icon.svg" alt="" width={12} height={12} />
            {uploading ? 'Uploading file…' : isPending ? 'Saving…' : 'Publish Resource'}
          </button>
        </div>
      </form>
    </div>
  )
}
