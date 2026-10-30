import { createClient } from '@/lib/supabase/server'
import { ANNOUNCEMENT_CLUBS_EMBED, announcementClubIds } from '@/lib/announcement-clubs'
import type { AnnouncementValues } from './announcement-form'
import type { ClubOption } from '@/app/(dashboard)/super-admin/events/event-clubs-field'

// The announcement with its clubs, plus the clubs that can be picked:
// active clubs, and any inactive club it's already linked to (which can be
// kept, but not newly picked). Null if it doesn't exist.
export async function loadAnnouncementForEdit(id: string): Promise<{ announcement: AnnouncementValues; clubs: ClubOption[] } | null> {
  const supabase = await createClient()
  const [{ data: row }, { data: allClubs }] = await Promise.all([
    supabase
      .from('announcements')
      .select(`id, title, body, publish_date, expiry_date, priority, audience, status, is_pinned, ${ANNOUNCEMENT_CLUBS_EMBED}`)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('clubs').select('id, name, is_active').order('name'),
  ])
  if (!row) return null

  const { announcement_clubs: _links, ...rest } = row
  const announcement: AnnouncementValues = { ...rest, is_all_clubs: !!row.is_all_clubs, club_ids: announcementClubIds(row) }
  const linked = new Set(announcement.club_ids)
  const clubs = (allClubs ?? [])
    .filter(c => c.is_active || linked.has(c.id))
    .map(c => ({ id: c.id, name: c.name, inactive: !c.is_active }))
  return { announcement, clubs }
}
