'use client'

// The event's clubs (optional — none means open to all clubs). A Super Admin
// ticks any number of clubs; a Champion can only link their own club, so
// they get a single tick box for it. Posts one club_ids value per ticked
// club (read by readClubIds in lib/event-clubs.ts).
export function EventClubsField({
  clubs = [],
  ownClub,
  defaultClubIds = [],
}: {
  clubs?: { id: string; name: string }[]
  ownClub?: { id: string; name: string }
  defaultClubIds?: string[]
}) {
  const label = 'mb-1.5 block text-[13px] font-medium tracking-[0.24px] text-[#0F172A]'
  const hint = 'mt-1.5 text-[11px] text-[#94A3B8]'

  if (ownClub) {
    return (
      <div>
        <span className={label}>Club</span>
        <label className="flex h-10 items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5">
          <input
            type="checkbox" name="club_ids" value={ownClub.id}
            defaultChecked={defaultClubIds.includes(ownClub.id)}
            className="h-4 w-4 rounded border-[#D4D7E3]"
          />
          <span className="text-sm font-semibold text-[#0F172A]">{ownClub.name}</span>
          <span className="ml-auto text-[11px] text-[#64748B]">Your club</span>
        </label>
        <p className={hint}>Untick to make this an event open to all clubs.</p>
      </div>
    )
  }

  return (
    <fieldset>
      <legend className={label}>Clubs</legend>
      {clubs.length === 0 ? (
        <p className="text-[12px] text-[#64748B]">No active clubs — the event will be open to all clubs.</p>
      ) : (
        <div className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          {clubs.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-[#0F172A]">
              <input
                type="checkbox" name="club_ids" value={c.id}
                defaultChecked={defaultClubIds.includes(c.id)}
                className="h-4 w-4 flex-shrink-0 rounded border-[#D4D7E3]"
              />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      )}
      <p className={hint}>Optional. Tick one or more clubs, or leave all unticked for an event open to all clubs.</p>
    </fieldset>
  )
}
