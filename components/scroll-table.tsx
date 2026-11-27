// Fix Q1: shared wrapper for wide tables. Wrap the <table> (inside its card):
//
//   <ScrollTable label="Clubs" minWidth={880}>
//     <table className="w-full table-fixed">…</table>
//   </ScrollTable>
//
// Below the desktop breakpoint (1024px) the table keeps at least `minWidth`
// and scrolls sideways inside its card, with the first column (the name)
// pinned on the left so you always know which row you are on. The scroll
// area can be reached with Tab and scrolled with the arrow keys.
// From 1024px up nothing changes: every rule below is phone/tablet-only.
//
// Fix Q2: `className` adds the box's own classes (e.g. a table that already
// scrolled in its own box: "overflow-x-auto" or "max-h-56 overflow-y-auto"),
// so that box and the phone scroll area are one element, not two nested ones.

export const SCROLL_TABLE_CLASSES = [
  'max-lg:overflow-x-auto',
  // Keyboard: a visible ring when the scroll area has focus.
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#265BA2]',
  // Keep the table wide enough to read; the card scrolls instead of squashing it.
  'max-lg:[&>table]:min-w-[var(--scroll-table-min)]',
  // First column stays put, on a solid background so scrolled cells hide behind it.
  'max-lg:[&_tr>*:first-child]:sticky max-lg:[&_tr>*:first-child]:left-0 max-lg:[&_tr>*:first-child]:z-[1]',
  'max-lg:[&_tr>*:first-child]:shadow-[1px_0_0_#E2E8F0]',
  'max-lg:[&_thead_tr>*:first-child]:bg-[#F9F9F9]',
  'max-lg:[&_tbody_tr>*:first-child]:bg-white',
  'max-lg:[&_tbody_tr:hover>*:first-child]:bg-gray-50',
].join(' ')

export function ScrollTable({
  label,
  minWidth = 880,
  className,
  children,
}: {
  /** What the table lists, e.g. "Clubs" — read out by screen readers. */
  label: string
  /** Narrowest the table may get before it scrolls (px). */
  minWidth?: number
  /** Extra classes for the scroll box itself (kept on every screen size). */
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="region"
      aria-label={`${label} table`}
      // Lets keyboard users reach the scroll area and use the arrow keys.
      tabIndex={0}
      className={className ? `${SCROLL_TABLE_CLASSES} ${className}` : SCROLL_TABLE_CLASSES}
      style={{ '--scroll-table-min': `${minWidth}px` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
