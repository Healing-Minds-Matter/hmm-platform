'use client'

// The top-bar bell (Story 10.14 Sc03): a real unread count and the latest
// notifications. Opening it marks the shown ones read.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markNotificationsReadAction } from '@/actions/certificates'

export type BellNotification = { id: string; body: string; created_at: string; read: boolean; href: string | null }

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export function NotificationBell({ notifications, unread }: { notifications: BellNotification[]; unread: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Shown as unread while the dropdown is open, even after they're marked read.
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = async () => {
    const opening = !open
    setOpen(opening)
    if (!opening) return
    const ids = notifications.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    setSeen(new Set(ids))
    await markNotificationsReadAction(ids)
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/notification-bell.svg" alt="" width={11} height={15} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_white]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_10px_30px_-8px_rgba(15,23,42,0.25)]">
          <div className="border-b border-[#E2E8F0] px-4 py-3 text-[13px] font-bold text-[#0F172A]">Notifications</div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[#64748B]">No notifications yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {notifications.map(n => {
                const isNew = !n.read || seen.has(n.id)
                const body = (
                  <div className={`flex gap-3 px-4 py-3 ${isNew ? 'bg-[#F8FAFF]' : ''}`}>
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isNew ? 'bg-[#265BA2]' : 'bg-transparent'}`} />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-[18px] text-[#0F172A]">{n.body}</p>
                      <p className="mt-1 text-[11px] text-[#64748B]">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                )
                return (
                  <li key={n.id} className="border-b border-[#F1F5F9] last:border-0">
                    {n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="block hover:bg-[#F1F5F9]">{body}</Link> : body}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
