// Database tests for Security Finding 4 — attendance and event registration.
// Calls Supabase directly as each kind of user (what the mobile app or a
// forged request can send).
//
//   node supabase/tests/event-registration-attendance-rls.mjs     (from the project root)
//
// Needs migration 20261112000003.
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f4')

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const gkB = await mkUser('gk-b', 'gatekeeper', B)
  const ch = await mkUser('ch', 'champion', A)
  const chB = await mkUser('ch-b', 'champion', B)
  const sa = await mkUser('sa', 'super_admin', null)

  const events = []
  onCleanup(async () => {
    await admin.from('event_registrations').delete().in('event_id', events)
    await admin.from('audit_logs').delete().in('entity_id', events)
    await admin.from('event_clubs').delete().in('event_id', events)
    await admin.from('events').delete().in('id', events)
  })
  // Events are created by the service role here (event creation has its own tests).
  async function mkEvent(title, { clubs = [], all = false, days = 7, cancelled = false } = {}) {
    const starts = new Date(Date.now() + days * 864e5).toISOString()
    const { data, error } = await admin.from('events').insert({
      title: `ZZ RLS f4 ${title}`, type: 'workshop', starts_at: starts, venue: 'x', club_id: all ? null : clubs[0],
      created_by: ch.id, is_all_clubs: all, is_cancelled: cancelled,
    }).select('id').single()
    if (error) throw error
    events.push(data.id)
    // The first club is linked automatically from club_id; link the rest.
    for (const c of clubs.slice(1)) await admin.from('event_clubs').insert({ event_id: data.id, club_id: c })
    return data.id
  }
  const reg = async (who, eventId, extra = {}) =>
    (await who.db.from('event_registrations').insert({ event_id: eventId, gatekeeper_id: who.id, ...extra })).error
  const regRow = async (eventId, gkId) =>
    (await admin.from('event_registrations').select('*').eq('event_id', eventId).eq('gatekeeper_id', gkId).maybeSingle()).data

  const own = await mkEvent('own club', { clubs: [A] })
  const selected = await mkEvent('selected incl A', { clubs: [A, B] })
  const allClubs = await mkEvent('all clubs', { all: true })
  const otherClub = await mkEvent('other club', { clubs: [B] })
  const cancelled = await mkEvent('cancelled', { clubs: [A], cancelled: true })
  const past = await mkEvent('past', { clubs: [A], days: -2 })

  // ── Gatekeeper registration ──
  check('Gatekeeper: can register for own-club event', !(await reg(gk, own)))
  check('Gatekeeper: can register for a selected-clubs event incl. theirs', !(await reg(gk, selected)))
  check('Gatekeeper: can register for an all-clubs event', !(await reg(gk, allClubs)))
  check('Gatekeeper: can’t register for another club’s event', !!(await reg(gk, otherClub)) && !(await regRow(otherClub, gk.id)))
  const cErr = await reg(gk, cancelled)
  check('Gatekeeper: can’t register for a cancelled event', !!cErr && !(await regRow(cancelled, gk.id)), cErr?.message)
  const pErr = await reg(gk, past)
  check('Gatekeeper: can’t register for a past event', !!pErr && !(await regRow(past, gk.id)), pErr?.message)
  const dupErr = await reg(gk, own)
  check('Gatekeeper: can’t register twice', dupErr?.code === '23505', dupErr?.message)
  const forOther = (await gk.db.from('event_registrations').insert({ event_id: own, gatekeeper_id: gkB.id })).error
  check('Gatekeeper: can’t register someone else', !!forOther && !(await regRow(own, gkB.id)))
  const preAttended = await reg(gkB, allClubs, { attended: true })
  const preRow = await regRow(allClubs, gkB.id)
  check('Gatekeeper: registering with attended=true doesn’t mark attendance', !preRow || preRow.attended === null, preAttended?.message ?? JSON.stringify(preRow))
  check('Champion: can’t register their Gatekeepers for events (no such feature)', !!(await ch.db.from('event_registrations').insert({ event_id: selected, gatekeeper_id: gkB.id })).error || !(await regRow(selected, gkB.id)))

  // ── Attendance ──
  await gk.db.from('event_registrations').update({ attended: true }).eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Gatekeeper: can’t mark own attendance', (await regRow(own, gk.id)).attended === null)
  await gk.db.from('event_registrations').update({ event_id: selected }).eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Gatekeeper: can’t move a registration to another event', !!(await regRow(own, gk.id)))
  await chB.db.from('event_registrations').update({ attended: true }).eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Champion (other club): can’t mark attendance', (await regRow(own, gk.id)).attended === null)
  const { error: chErr } = await ch.db.from('event_registrations').update({ attended: true }).eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Champion (own club): can mark attendance', (await regRow(own, gk.id)).attended === true, chErr?.message)
  const { error: saErr } = await sa.db.from('event_registrations').update({ attended: false }).eq('event_id', allClubs).eq('gatekeeper_id', gk.id)
  check('Super Admin: can mark attendance', (await regRow(allClubs, gk.id)).attended === false, saErr?.message)
  const { data: audit } = await admin.from('audit_logs').select('actor_id, action').eq('entity_id', own).eq('action', 'event.attendance_marked')
  check('attendance change is audited with the real caller', audit?.some(a => a.actor_id === ch.id), JSON.stringify(audit))
  await ch.db.from('event_registrations').update({ registered_at: '2020-01-01T00:00:00Z' }).eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Champion: can’t change anything but attendance', !(await regRow(own, gk.id)).registered_at.startsWith('2020'))

  // ── History is kept ──
  await gk.db.from('event_registrations').delete().eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Gatekeeper: can’t delete a registration', !!(await regRow(own, gk.id)))
  await ch.db.from('event_registrations').delete().eq('event_id', own).eq('gatekeeper_id', gk.id)
  check('Champion: can’t delete a registration', !!(await regRow(own, gk.id)))
  await admin.from('events').update({ is_cancelled: true }).eq('id', own)
  check('cancelling an event keeps its registrations', !!(await regRow(own, gk.id)))
  check('Gatekeeper: still sees their registration for the cancelled event', ((await gk.db.from('event_registrations').select('id').eq('event_id', own)).data ?? []).length === 1)
})
