import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAnnouncementForEdit } from '@/app/(dashboard)/super-admin/announcements/load-announcement-for-edit'

// What the Champion announcement pages need (sheet row 61): the Champion's own
// club (the only target they may choose) and whether their permissions allow
// publishing (publish_club_announcements). The server action and the
// database check the same again.
export async function championAnnouncementContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/champion/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, clubs!profiles_club_id_fkey(name)')
    .eq('id', user.id)
    .single()
  if (!profile?.club_id) return null
  const club = (Array.isArray(profile.clubs) ? profile.clubs[0] : profile.clubs) as { name?: string } | null
  const { data: canPublish } = await supabase.rpc('cert_can', { p_permission: 'publish_club_announcements' })
  return { userId: user.id, ownClub: { id: profile.club_id as string, name: club?.name ?? 'Your club' }, canPublish: canPublish === true }
}

/** The Champion's own announcement, ready for the shared edit form; null if not theirs. */
export async function loadOwnAnnouncement(id: string, userId: string) {
  const supabase = await createClient()
  const { data: mine } = await supabase.from('announcements').select('id').eq('id', id).eq('created_by', userId).maybeSingle()
  if (!mine) return null
  return loadAnnouncementForEdit(id)
}
