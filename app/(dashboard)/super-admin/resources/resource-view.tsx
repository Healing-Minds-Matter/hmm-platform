import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { RESOURCE_TYPE_LABEL } from './design-tokens'

// The full, read-only view of a resource (sheet rows 36 and 63): mainly for
// articles, whose text was otherwise only readable through Edit and cut off in
// the list. Shared by the Super Admin and Champion portals; what each user may
// open is decided by RLS (Champions only see published resources).

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function ResourceView({ id, basePath, canManage, publishedOnly }: {
  id: string
  basePath: string
  canManage: boolean
  publishedOnly: boolean
}) {
  const supabase = await createClient()
  let query = supabase
    .from('resources')
    .select('id, title, description, type, category, publication_date, content_url, content_text, status')
    .eq('id', id)
  if (publishedOnly) query = query.eq('status', 'published')
  const { data: r } = await query.maybeSingle()
  if (!r) return null

  let link: string | null = null
  if (r.content_url) {
    if (isExternalUrl(r.content_url)) link = r.content_url
    else {
      // Short-lived signed link to the private file, made for this viewer.
      const { data } = await supabase.storage.from('resources').createSignedUrl(r.content_url, 3600)
      link = data?.signedUrl ?? null
    }
  }

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <Link href={basePath} className="text-[13px] font-semibold text-[#003495] hover:underline">← Learning Resources</Link>
      <article className="flex max-w-[860px] flex-col gap-4 rounded-xl bg-white p-8 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.44px]">
          {r.category && <span className="rounded-full bg-[#EFF4FF] px-2.5 py-0.5 text-[#1E4BB8]">{r.category}</span>}
          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[#475569]">{RESOURCE_TYPE_LABEL[r.type] ?? r.type}</span>
          {r.status === 'draft' && <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[#92400E]">Draft</span>}
        </div>
        <h1 className="font-[family-name:var(--font-jakarta)] text-[26px] font-bold leading-8 tracking-[-0.5px] text-[#0F172A]">{r.title}</h1>
        <p className="text-[12px] text-[#64748B]">Published {formatDate(r.publication_date)}</p>
        {r.description && <p className="text-[14px] leading-6 text-[#475569]">{r.description}</p>}
        {r.content_text && (
          <div className="whitespace-pre-wrap border-t border-[#F1F5F9] pt-4 text-[15px] leading-7 text-[#0F172A]">{r.content_text}</div>
        )}
        {link && (
          <p className="border-t border-[#F1F5F9] pt-4 text-[14px]">
            <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#003495] underline">
              {r.type === 'article' ? 'Open the article link' : 'Open the file'}<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {isExternalUrl(r.content_url!) && <span className="ml-2 break-all text-[12px] text-[#64748B]">{r.content_url}</span>}
          </p>
        )}
        {!r.content_text && !link && <p className="text-[13px] text-[#64748B]">This resource has no content yet.</p>}
        {canManage && (
          <div className="border-t border-[#F1F5F9] pt-4">
            <Link href={`${basePath}/${r.id}/edit`} className="inline-flex items-center rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[12px] font-semibold text-[#475569] hover:bg-slate-200">
              Edit
            </Link>
          </div>
        )}
      </article>
    </div>
  )
}
