import 'server-only'
// The signed-in user's latest notifications for the top-bar bell (Story 10.14),
// each with a link to where it applies. Certificate notifications link to the
// holder's profile page for this viewer, or to their own profile.
import { createClient } from '@/lib/supabase/server'
import type { BellNotification } from '@/components/notification-bell'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export async function loadBell(supabase: ServerClient, me: { id: string; role: string }): Promise<{ notifications: BellNotification[]; unread: number }> {
  const [{ data: rows }, { count }] = await Promise.all([
    supabase.from('notifications').select('id, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  const list = rows ?? []
  const certIds = [...new Set(list.map(n => (n.link as { type?: string; id?: string } | null))
    .filter(l => l?.type === 'certificate' && l.id).map(l => l!.id!))]

  // Holder and their role per linked certificate (only certificates this user can see).
  const holderOf = new Map<string, { id: string; role: string }>()
  if (certIds.length) {
    const { data: certs } = await supabase.from('certificates').select('id, holder:profiles!certificates_holder_id_fkey(id, role)').in('id', certIds)
    for (const c of certs ?? []) {
      const h = (Array.isArray(c.holder) ? c.holder[0] : c.holder) as { id: string; role: string } | null
      if (h) holderOf.set(c.id, h)
    }
  }
  const profileHref = (h: { id: string; role: string }) => {
    if (h.id === me.id) return me.role === 'super_admin' ? '/super-admin/profile' : '/champion/profile'
    if (me.role === 'super_admin') return h.role === 'champion' ? `/super-admin/champions/${h.id}` : `/super-admin/gatekeepers/${h.id}`
    if (me.role === 'champion' && h.role === 'gatekeeper') return `/champion/gatekeepers/${h.id}`
    return null
  }

  return {
    unread: count ?? 0,
    notifications: list.map(n => {
      const link = n.link as { type?: string; id?: string } | null
      const holder = link?.type === 'certificate' && link.id ? holderOf.get(link.id) : undefined
      return { id: n.id, body: n.body, created_at: n.created_at, read: !!n.read_at, href: holder ? profileHref(holder) : null }
    }),
  }
}
