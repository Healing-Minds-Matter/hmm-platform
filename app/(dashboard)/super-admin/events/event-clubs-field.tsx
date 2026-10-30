'use client'

import { useState } from 'react'

export type ClubOption = { id: string; name: string; inactive?: boolean }

// Which clubs the event is for. Posts club_scope ('all' | 'selected') and
// one club_ids value per selected club — read by readClubChoice in
// lib/event-clubs.ts, and checked again on the server and in the database.
//
// Champion (ownClub): fixed to their own club, read-only.
// Super Admin: "All clubs", or "Selected clubs" from a searchable list of
// active clubs (plus any inactive club the event is already linked to,
// which can be kept but not newly picked).
export function EventClubsField({
  clubs = [],
  ownClub,
  defaultAllClubs = false,
  defaultClubIds = [],
}: {
  clubs?: ClubOption[]
  ownClub?: { id: string; name: string }
  defaultAllClubs?: boolean
  defaultClubIds?: string[]
}) {
  const label = 'mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]'
  const [allClubs, setAllClubs] = useState(defaultAllClubs)
  const [selected, setSelected] = useState<string[]>(defaultClubIds)
  const [query, setQuery] = useState('')

  if (ownClub) {
    return (
      <div>
        <span className={label}>Assigned Club</span>
        <input type="hidden" name="club_scope" value="selected" />
        <input type="hidden" name="club_ids" value={ownClub.id} />
        <div className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#EFF4FF] px-3.5">
          <span className="text-sm font-semibold text-[#0F172A]">{ownClub.name}</span>
          <span className="ml-auto text-[11px] text-[#64748B]">Your club</span>
        </div>
      </div>
    )
  }

  const nameById = Object.fromEntries(clubs.map(c => [c.id, c.name]))
  const q = query.trim().toLowerCase()
  // Inactive clubs only appear while still selected (can be kept or removed, not re-added).
  const options = clubs.filter(c => (!c.inactive || selected.includes(c.id)) && (!q || c.name.toLowerCase().includes(q)))
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
  const radio = (on: boolean) =>
    `flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium ${
      on ? 'border-[#6586C2] bg-[rgba(0,52,149,0.05)] text-[#0F172A]' : 'border-[#E2E8F0] bg-white text-[#475569]'
    }`

  return (
    <fieldset>
      <legend className={label}>
        Assigned Club <span className="text-[#DC2626]">*</span>
      </legend>
      <input type="hidden" name="club_scope" value={allClubs ? 'all' : 'selected'} />
      {!allClubs && selected.map(id => <input key={id} type="hidden" name="club_ids" value={id} />)}

      <div className="flex gap-2.5">
        <label className={radio(allClubs)}>
          <input type="radio" name="club_scope_choice" checked={allClubs} onChange={() => setAllClubs(true)} className="h-4 w-4" />
          All clubs
        </label>
        <label className={radio(!allClubs)}>
          <input type="radio" name="club_scope_choice" checked={!allClubs} onChange={() => setAllClubs(false)} className="h-4 w-4" />
          Selected clubs
        </label>
      </div>

      {!allClubs && (
        <div className="mt-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map(id => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#EFF4FF] px-2.5 py-1 text-[12px] font-medium text-[#003495]">
                  {nameById[id] ?? 'Unknown club'}
                  <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${nameById[id] ?? 'club'}`} className="text-[#64748B] hover:text-[#0F172A]">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search clubs…"
            aria-label="Search clubs"
            className="mb-2 h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
          />
          <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto">
            {options.length === 0 ? (
              <p className="col-span-2 text-[12px] text-[#64748B]">No clubs match “{query}”.</p>
            ) : (
              options.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-[#0F172A]">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 flex-shrink-0 rounded border-[#D4D7E3]"
                  />
                  <span className="truncate">{c.name}{c.inactive ? ' (inactive)' : ''}</span>
                </label>
              ))
            )}
          </div>
          <p className="mt-2 text-[11px] text-[#94A3B8]">
            {selected.length === 0 ? 'Choose at least one club.' : `${selected.length} club${selected.length === 1 ? '' : 's'} selected.`}
          </p>
        </div>
      )}
    </fieldset>
  )
}
