'use client'

// "Add to several people" (Story 10.5 Sc07): one type and date achieved, ticked
// for everyone who attended a training session. Each person is added on their
// own and the result for each is shown.

import { useActionState, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModalOverlay } from '@/components/modal-overlay'
import { FormCard, CANCEL_BTN, HINT, INPUT, LABEL, OPTION, PRIMARY_BTN } from '@/components/certifications/cert-ui'
import { formatCertDate } from '@/lib/certification-types'
import { FORMAT_LABEL, expiryFor, type CertificateFormat } from '@/lib/certificates'
import { addCertificateToManyAction } from '@/actions/certificates'
import type { AwardableType } from '@/lib/certifications.server'

export type BulkPerson = { id: string; name: string; code: string | null; clubId: string | null; clubName: string | null }

export function BulkAwardButton({ people, types, clubs, today }: {
  people: BulkPerson[]
  types: AwardableType[]
  clubs?: { id: string; name: string }[]   // Super Admins pick a club; Champions only have their own
  today: string
}) {
  const [open, setOpen] = useState(false)
  // Remount the form each time so a finished batch doesn't linger.
  const [round, setRound] = useState(0)
  return (
    <>
      <button
        type="button"
        onClick={() => { setRound(r => r + 1); setOpen(true) }}
        className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-[12px] font-semibold tracking-[0.24px] text-[#022C51] transition-colors hover:bg-[#F1F5F9]"
      >
        Add certification to several
      </button>
      {open && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <BulkAwardForm key={round} people={people} types={types} clubs={clubs} today={today} onClose={() => setOpen(false)} />
        </ModalOverlay>
      )}
    </>
  )
}

function BulkAwardForm({ people, types, clubs, today, onClose }: {
  people: BulkPerson[]
  types: AwardableType[]
  clubs?: { id: string; name: string }[]
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addCertificateToManyAction>>, fd: FormData) => {
    const result = await addCertificateToManyAction(prev, fd)
    if (result?.done?.some(d => d.ok)) router.refresh()
    return result
  }, null)
  const [typeId, setTypeId] = useState('')
  const [date, setDate] = useState('')
  const [format, setFormat] = useState<CertificateFormat>('physical')
  const [club, setClub] = useState(clubs?.[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const type = types.find(t => t.id === typeId)
  const expiry = type && date ? expiryFor(date, type.validity_value, type.validity_unit) : null
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people.filter(p => (!clubs || p.clubId === club) && (!q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)))
  }, [people, clubs, club, search])
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allShownPicked = shown.length > 0 && shown.every(p => picked.has(p.id))

  if (state?.done) {
    const ok = state.done.filter(d => d.ok).length
    return (
      <FormCard title="Certifications added" subtitle={`${ok} of ${state.done.length} added${type ? ` (${type.name}, ${formatCertDate(date)})` : ''}.`} onClose={onClose}>
        <ul className="flex max-h-[50vh] flex-col overflow-y-auto px-6 pb-4 text-[13px]">
          {state.done.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] py-2 last:border-0">
              <span className="text-[#0F172A]">{d.name}</span>
              <span className={d.ok ? 'text-[#0D8275]' : 'text-[#DC2626]'}>{d.ok ? (d.note ?? 'Added') : d.note}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={onClose} className={PRIMARY_BTN}>Done</button>
        </div>
      </FormCard>
    )
  }

  return (
    <FormCard title="Add certification to several Gatekeepers" subtitle="For a training session: one type and date for everyone who attended." onClose={onClose}>
      <form action={formAction} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          {state?.error && <div role="alert" className="rounded-lg bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-medium text-[#DC2626]">{state.error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="bulk-type">Certification type</label>
              <select id="bulk-type" name="type_id" value={typeId} onChange={e => setTypeId(e.target.value)} className={INPUT} required>
                <option value="">Choose a type…</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="bulk-date">Date achieved</label>
              <input id="bulk-date" type="date" name="achieved_on" value={date} max={today} min={type?.offered_from} onChange={e => setDate(e.target.value)} className={INPUT} required />
              {type && <p className={HINT}>{type.validity_value == null ? 'Lifetime (no expiry)' : expiry ? `Valid until ${formatCertDate(expiry)}` : ''}</p>}
            </div>
          </div>
          <fieldset>
            <legend className={LABEL}>Format</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FORMAT_LABEL) as CertificateFormat[]).map(f => (
                <label key={f} className={OPTION}>
                  <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="mt-0.5 accent-[#022C51]" />
                  {FORMAT_LABEL[f]}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className={LABEL.replace('mb-1.5 ', '')}>Who attended ({picked.size} selected)</span>
              <button
                type="button"
                onClick={() => setPicked(s => { const n = new Set(s); for (const p of shown) { if (allShownPicked) n.delete(p.id); else n.add(p.id) } return n })}
                className="text-xs font-semibold text-[#265BA2] hover:underline"
                disabled={!shown.length}
              >
                {allShownPicked ? 'Clear shown' : 'Select all shown'}
              </button>
            </div>
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {clubs && (
                <select aria-label="Club" value={club} onChange={e => setClub(e.target.value)} className={INPUT}>
                  {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <input type="search" aria-label="Search Gatekeepers" placeholder="Search by name or ID" value={search} onChange={e => setSearch(e.target.value)} className={INPUT} />
            </div>
            <div className="max-h-[240px] overflow-y-auto rounded-xl border border-[#E2E8F0]">
              {shown.length === 0 ? (
                <p className="px-4 py-5 text-center text-[13px] text-[#64748B]">No active Gatekeepers{clubs ? ' in this club' : ''}.</p>
              ) : shown.map(p => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-[#F1F5F9] px-4 py-2.5 text-[13px] last:border-0 hover:bg-[#F8FAFC]">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#022C51]" />
                  <span className="flex-1 text-[#0F172A]">{p.name}</span>
                  {p.code && <span className="font-mono text-[11px] font-bold text-[#003495]">{p.code}</span>}
                </label>
              ))}
            </div>
            {/* Ticked people from other clubs or searches stay selected. */}
            {[...picked].map(id => <input key={id} type="hidden" name="holder_ids" value={id} />)}
            <p className={HINT}>Anyone who already holds this type has it renewed, if the new date is later.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-[#E2E8F0] px-6 py-4">
          <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
          <button type="submit" disabled={pending || picked.size === 0} className={PRIMARY_BTN}>
            {pending ? 'Adding…' : `Add to ${picked.size || ''} ${picked.size === 1 ? 'person' : 'people'}`.replace('  ', ' ')}
          </button>
        </div>
      </form>
    </FormCard>
  )
}
