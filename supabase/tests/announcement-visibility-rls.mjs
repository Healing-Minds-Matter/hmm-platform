// Database tests for Security Finding 7 — a Gatekeeper only ever sees
// published, in-window announcements meant for them: through the table,
// the side tables, the label function, saves/reads, and realtime.
//
//   node supabase/tests/announcement-visibility-rls.mjs     (from the project root)
import { admin, rlsSuite } from './_rls-helpers.mjs'

const { check, mkClub, mkUser, onCleanup, run } = rlsSuite('f7')
const sleep = ms => new Promise(r => setTimeout(r, ms))

await run(async () => {
  const A = await mkClub('A')
  const B = await mkClub('B')
  const gk = await mkUser('gk', 'gatekeeper', A)
  const gk2 = await mkUser('gk2', 'gatekeeper', A)
  const ch = await mkUser('ch', 'champion', A)
  const sa = await mkUser('sa', 'super_admin', null)

  const ids = []
  onCleanup(async () => {
    for (const t of ['announcement_reads', 'announcement_saves', 'announcement_recipients', 'announcement_clubs']) await admin.from(t).delete().in('announcement_id', ids)
    await admin.from('audit_logs').delete().in('entity_id', ids)
    await admin.from('announcements').delete().in('id', ids)
  })
  const DAY = 864e5, now = Date.now()
  async function mk(title, { status = 'published', audience = 'all', all = audience === 'specific_clubs' ? false : false, clubs = [], people = [], from = -DAY, to = null, by = sa.id } = {}) {
    const { data, error } = await admin.from('announcements').insert({
      title: `ZZ RLS f7 ${title}`, body: 'x', status, audience, is_all_clubs: all, created_by: by, club_id: null,
      publish_date: new Date(now + from).toISOString(), expiry_date: to === null ? null : new Date(now + to).toISOString(),
    }).select('id').single()
    if (error) throw new Error(`${title}: ${error.message}`)
    ids.push(data.id)
    for (const c of clubs) await admin.from('announcement_clubs').insert({ announcement_id: data.id, club_id: c })
    for (const p of people) await admin.from('announcement_recipients').insert({ announcement_id: data.id, user_id: p })
    return data.id
  }

  const visible = {
    everyone: await mk('everyone', { audience: 'all' }),
    gatekeepers: await mk('gatekeepers', { audience: 'gatekeepers' }),
    allClubs: await mk('all clubs', { audience: 'specific_clubs', all: true }),
    myClub: await mk('my club', { audience: 'specific_clubs', clubs: [A] }),
    meByName: await mk('me by name', { audience: 'specific_clubs', clubs: [A], people: [gk.id] }),
    noExpiry: await mk('no expiry', { to: null }),
  }
  const hidden = {
    draft: await mk('draft', { status: 'draft' }),
    scheduled: await mk('scheduled', { from: DAY }),
    expired: await mk('expired', { from: -2 * DAY, to: -DAY }),
    championsOnly: await mk('champions only', { audience: 'champions' }),
    otherClub: await mk('other club', { audience: 'specific_clubs', clubs: [B] }),
    someoneElse: await mk('someone else by name', { audience: 'specific_clubs', clubs: [A], people: [gk2.id] }),
    draftMyClub: await mk('draft for my club', { status: 'draft', audience: 'specific_clubs', clubs: [A] }),
  }

  // ── The table ──
  const { data: seen } = await gk.db.from('announcements').select('id').in('id', ids)
  const seenIds = new Set((seen ?? []).map(r => r.id))
  for (const [k, id] of Object.entries(visible)) check(`Gatekeeper sees: ${k}`, seenIds.has(id))
  for (const [k, id] of Object.entries(hidden)) check(`Gatekeeper never sees: ${k}`, !seenIds.has(id))
  const { data: chSeen } = await ch.db.from('announcements').select('id').eq('id', hidden.championsOnly)
  check('Champion does see the Champion-only announcement (control)', (chSeen ?? []).length === 1)

  // ── Side tables and the label function ──
  const hiddenIds = Object.values(hidden)
  const { data: links } = await gk.db.from('announcement_clubs').select('announcement_id').in('announcement_id', hiddenIds)
  check('announcement_clubs: no rows for hidden announcements', (links ?? []).length === 0, JSON.stringify(links))
  const { data: recips } = await gk.db.from('announcement_recipients').select('announcement_id').in('announcement_id', hiddenIds)
  check('announcement_recipients: no rows for hidden announcements', (recips ?? []).length === 0, JSON.stringify(recips))
  const { data: labels } = await gk.db.rpc('announcement_source_labels', { p_announcement_ids: hiddenIds })
  check('announcement_source_labels: nothing for hidden announcements', (labels ?? []).length === 0, JSON.stringify(labels))
  const { data: okLabels } = await gk.db.rpc('announcement_source_labels', { p_announcement_ids: Object.values(visible) })
  check('announcement_source_labels: still works for visible ones', (okLabels ?? []).length === Object.keys(visible).length, `${okLabels?.length}`)

  // ── Saves / reads can't be used to probe hidden announcements ──
  const { error: saveErr } = await gk.db.from('announcement_saves').insert({ announcement_id: hidden.draft, gatekeeper_id: gk.id })
  check('Gatekeeper can’t save a hidden announcement', !!saveErr)
  const { error: readErr } = await gk.db.from('announcement_reads').insert({ announcement_id: hidden.draft, gatekeeper_id: gk.id })
  check('Gatekeeper can’t mark a hidden announcement read', !!readErr)
  const { error: readOk } = await gk.db.from('announcement_reads').insert({ announcement_id: visible.everyone, gatekeeper_id: gk.id })
  check('Gatekeeper can still mark a visible announcement read', !readOk, readOk?.message)

  // ── Realtime: the same rules for live updates ──
  const events = []
  const channel = gk.db.channel(`zz-f7-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, p => events.push(p.new?.title))
  const status = await new Promise(resolve => {
    channel.subscribe(s => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(s) })
    setTimeout(() => resolve('TIMEOUT'), 15000)
  })
  check('realtime: Gatekeeper subscribed', status === 'SUBSCRIBED', status)
  await sleep(1500)
  await mk('rt draft', { status: 'draft' })
  await mk('rt champions only', { audience: 'champions' })
  await mk('rt other club', { audience: 'specific_clubs', clubs: [B] })
  await mk('rt published everyone', { audience: 'all' })
  await sleep(6000)
  await gk.db.removeChannel(channel)
  check('realtime: published announcement for them arrives', events.includes('ZZ RLS f7 rt published everyone'), JSON.stringify(events))
  check('realtime: draft never arrives', !events.includes('ZZ RLS f7 rt draft'), JSON.stringify(events))
  check('realtime: Champion-only never arrives', !events.includes('ZZ RLS f7 rt champions only'), JSON.stringify(events))
  check('realtime: other club never arrives', !events.includes('ZZ RLS f7 rt other club'), JSON.stringify(events))
})
process.exit()
