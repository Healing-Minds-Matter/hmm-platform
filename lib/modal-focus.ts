// Keyboard rules for the shared pop-up (components/modal-overlay.tsx), kept
// free of React so they can be unit-tested in Node.

// Elements that can take keyboard focus. Filtered further by isTabbable().
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',')

// What isTabbable() needs to know about an element.
export interface TabbableInfo {
  disabled: boolean
  tabIndex: number
  /** input type, if it is an <input> */
  type?: string
  /** false when the element takes no space on screen (display:none, hidden, collapsed) */
  rendered: boolean
}

// Can Tab land on this element?
export function isTabbable(el: TabbableInfo): boolean {
  if (el.disabled) return false
  if (el.tabIndex < 0) return false
  if (el.type === 'hidden') return false
  return el.rendered
}

// Where Tab / Shift+Tab should go inside the pop-up.
// `count` = tabbable elements inside; `current` = index of the focused one
// (-1 when focus is on the pop-up itself or somewhere outside it).
// Returns the index to focus, 'self' to keep focus on the pop-up box when
// there is nothing to tab to, or null to let the browser move normally.
export function nextTrapTarget(count: number, current: number, shift: boolean): number | 'self' | null {
  if (count === 0) return 'self'
  if (current < 0) return shift ? count - 1 : 0
  if (!shift && current === count - 1) return 0
  if (shift && current === 0) return count - 1
  return null
}

// Only the most recently opened pop-up reacts to Tab and Esc, so a pop-up
// opened on top of another closes on its own.
const openStack: symbol[] = []

export function pushModal(): symbol {
  const id = Symbol('modal')
  openStack.push(id)
  return id
}

export function popModal(id: symbol): void {
  const i = openStack.indexOf(id)
  if (i !== -1) openStack.splice(i, 1)
}

export function isTopModal(id: symbol): boolean {
  return openStack[openStack.length - 1] === id
}
