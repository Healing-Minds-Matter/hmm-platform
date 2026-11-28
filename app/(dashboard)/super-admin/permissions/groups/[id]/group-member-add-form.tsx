'use client'

import { useTransition } from 'react'
import { addGroupMemberAction } from '@/actions/permissions'

interface UserOption {
  id: string
  full_name: string
  role: string
}

export function GroupMemberAddForm({ groupId, availableUsers }: { groupId: string; availableUsers: UserOption[] }) {
  const [isPending, startTransition] = useTransition()

  if (availableUsers.length === 0) {
    return <p className="text-sm text-[#94A3B8]">All active Champions and Gatekeepers are already members.</p>
  }

  return (
    <form
      action={(fd) => startTransition(() => addGroupMemberAction(fd))}
      className="flex gap-2"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <select
        name="user_id"
        required
        className="h-10 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm text-[#0F172A] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1E4BB8]"
      >
        <option value="">Add a member…</option>
        {availableUsers.map(u => (
          <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="flex-shrink-0 rounded-lg bg-[#F4AC1E] px-4 text-[13px] font-semibold text-on-amber shadow-[0_1px_1px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#E09B0F] disabled:opacity-60"
      >
        {isPending ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}
