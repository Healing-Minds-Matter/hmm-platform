'use client'

// The in-portal user manual (sheet row 55): a searchable guide for the
// signed-in user's own role, opened at the section for the page they came from
// (the header's ? icon links to #<section>), with a support contact.
import { useEffect, useId, useState } from 'react'
import type { HelpManual } from '@/lib/help/types'
import { searchManual } from '@/lib/help/topics'

export function HelpCentre({ manual, supportEmail }: { manual: HelpManual; supportEmail: string | null }) {
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const searchId = useId()
  const sections = searchManual(manual, query)

  // Highlight the section the ? icon pointed at (and keep it in step with later jumps).
  useEffect(() => {
    const read = () => setCurrent(decodeURIComponent(window.location.hash.slice(1)) || null)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return (
    <div className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-bold tracking-[-0.7px] text-[#0F172A]">Help</h1>
        <p className="max-w-[720px] text-[14px] leading-5 text-[#475569]">
          {manual.title}: how to do the main tasks in the portal. Search, or pick a topic.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <label htmlFor={searchId} className="mb-1.5 block text-[13px] font-medium text-[#0F172A]">Search help</label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. reset password"
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
            />
          </div>
          <nav aria-label="Help topics">
            <ul className="flex flex-col gap-0.5">
              {manual.sections.map(s => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={current === s.id ? 'location' : undefined}
                    className={`block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#265BA2] ${
                      current === s.id ? 'bg-[rgba(245,206,129,0.26)] text-[#022C51]' : 'text-[#475569] hover:bg-white hover:text-[#0F172A]'
                    }`}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <section aria-labelledby="help-contact" className="rounded-xl bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            <h2 id="help-contact" className="text-[13px] font-bold text-[#0F172A]">Still need help?</h2>
            {supportEmail ? (
              <>
                <p className="mt-1 text-[12px] leading-[18px] text-[#475569]">Email the HMM support team:</p>
                <CopyableEmail email={supportEmail} />
              </>
            ) : (
              <p className="mt-1 text-[12px] leading-[18px] text-[#475569]">Contact your HMM administrator. (A support email hasn’t been set up yet.)</p>
            )}
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-6" aria-live="polite">
          {query && (
            <p className="text-[13px] text-[#475569]">
              {sections.length ? `Showing results for “${query}”.` : `No help topics match “${query}”. Try other words, or contact support.`}
            </p>
          )}
          {sections.map(section => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className={`scroll-mt-4 rounded-xl bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] ${current === section.id && !query ? 'ring-2 ring-[#F4AC1E]' : ''}`}
            >
              <h2 id={`${section.id}-title`} className="text-[18px] font-bold text-[#0F172A]">{section.title}</h2>
              <p className="mt-1 text-[13px] text-[#64748B]">{section.summary}</p>
              <div className="mt-4 flex flex-col gap-5">
                {section.articles.map(a => (
                  <article key={a.id} id={`${section.id}-${a.id}`} className="scroll-mt-4">
                    <h3 className="text-[15px] font-semibold text-[#0F172A]">{a.title}</h3>
                    {a.intro && <p className="mt-1 max-w-[70ch] text-[14px] leading-6 text-[#334155]">{a.intro}</p>}
                    {a.steps && (
                      <ol className="mt-2 flex max-w-[70ch] list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-6 text-[#334155]">
                        {a.steps.map(step => <li key={step}>{step}</li>)}
                      </ol>
                    )}
                    {a.notes && (
                      <ul className="mt-2 flex max-w-[70ch] list-disc flex-col gap-1.5 pl-5 text-[14px] leading-6 text-[#334155]">
                        {a.notes.map(note => <li key={note}>{note}</li>)}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

// The address as selectable text, with a copy button (mail links don't work
// for everyone, so the text itself is what matters).
function CopyableEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="select-all break-all font-mono text-[12px] font-semibold text-[#003495]">{email}</span>
      <button
        type="button"
        onClick={copy}
        className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#475569] hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#265BA2]"
      >
        Copy
      </button>
      <span role="status" className="text-[11px] text-[#64748B]">
        {copied === 'done' ? 'Copied.' : copied === 'failed' ? 'Couldn’t copy. Select the address instead.' : ''}
      </span>
    </div>
  )
}
