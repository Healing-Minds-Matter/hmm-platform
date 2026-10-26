'use client'

import { useRef, type ReactNode } from 'react'
import { BULK_UPLOAD_MAX_ROWS } from '@/lib/csv'

export type ModeTab<T extends string> = { value: T; label: ReactNode }

// The "Single … / Bulk CSV Upload" switch at the top of the Add Gatekeeper
// and Create New Club modals. Keyboard: Tab reaches the selected tab, the
// left/right arrow keys (and Home/End) move between tabs.
export function ModeTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: ModeTab<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  idPrefix: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length
    onChange(tabs[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-2 px-6 pb-3">
      {tabs.map((tab, i) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(i + 1) }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(i - 1) }
              else if (e.key === 'Home') { e.preventDefault(); focusTab(0) }
              else if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1) }
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4BB8] ${
              selected ? 'border-[#E5E7EB] bg-white text-[#003495] shadow-sm' : 'border-transparent text-[#64748B] hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function BulkTabLabel() {
  return (
    <>
      Bulk CSV Upload
      <span className="rounded bg-[#E6EEFF] px-1.5 py-0.5 text-[10px] font-medium text-[#64748B]">Up to {BULK_UPLOAD_MAX_ROWS}</span>
    </>
  )
}
