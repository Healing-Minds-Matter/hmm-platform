import { describe, expect, it } from 'vitest'
import { dialogName, isTabbable, isTopModal, nextTrapTarget, pickReturnFocus, popModal, pushModal } from './modal-focus'

describe('pickReturnFocus — where focus goes when a pop-up closes', () => {
  const on = (n: string) => ({ n, isConnected: true })
  const gone = (n: string) => ({ n, isConnected: false })
  it('the opener, while it is still on the page', () => {
    expect(pickReturnFocus(on('opener'), on('ref'), on('main'))?.n).toBe('opener')
  })
  it('opener gone: returnFocusRef', () => {
    expect(pickReturnFocus(gone('opener'), on('ref'), on('main'))?.n).toBe('ref')
    expect(pickReturnFocus(null, on('ref'), on('main'))?.n).toBe('ref')
  })
  it('no opener or ref: <main>', () => {
    expect(pickReturnFocus(gone('opener'), null, on('main'))?.n).toBe('main')
    expect(pickReturnFocus(null, gone('ref'), on('main'))?.n).toBe('main')
  })
  it('nothing left: null', () => {
    expect(pickReturnFocus(null, undefined, null)).toBeNull()
    expect(pickReturnFocus(gone('a'), gone('b'), gone('c'))).toBeNull()
  })
})

describe('dialogName', () => {
  it('a heading wins over ariaLabel', () => {
    expect(dialogName('h-1', 'Label')).toEqual({ labelledBy: 'h-1' })
  })
  it('no heading: ariaLabel', () => {
    expect(dialogName(null, 'Certificate preview')).toEqual({ label: 'Certificate preview' })
  })
  it('neither (or a blank label): no name', () => {
    expect(dialogName(undefined, undefined)).toBeNull()
    expect(dialogName('', '   ')).toBeNull()
  })
})

describe('nextTrapTarget — Tab stays inside the pop-up', () => {
  it('Tab on the last element wraps to the first', () => {
    expect(nextTrapTarget(4, 3, false)).toBe(0)
  })
  it('Shift+Tab on the first element wraps to the last', () => {
    expect(nextTrapTarget(4, 0, true)).toBe(3)
  })
  it('lets the browser move normally in the middle', () => {
    expect(nextTrapTarget(4, 1, false)).toBeNull()
    expect(nextTrapTarget(4, 2, true)).toBeNull()
  })
  it('focus on the pop-up box itself (or outside): Tab goes to first, Shift+Tab to last', () => {
    expect(nextTrapTarget(4, -1, false)).toBe(0)
    expect(nextTrapTarget(4, -1, true)).toBe(3)
  })
  it('nothing to tab to: focus stays on the pop-up box', () => {
    expect(nextTrapTarget(0, -1, false)).toBe('self')
    expect(nextTrapTarget(0, -1, true)).toBe('self')
  })
  it('a single element keeps focus on itself both ways', () => {
    expect(nextTrapTarget(1, 0, false)).toBe(0)
    expect(nextTrapTarget(1, 0, true)).toBe(0)
  })
})

describe('isTabbable', () => {
  const base = { disabled: false, tabIndex: 0, rendered: true }
  it('a normal visible control is tabbable', () => {
    expect(isTabbable(base)).toBe(true)
  })
  it('skips disabled, tabindex=-1, hidden inputs and things not on screen', () => {
    expect(isTabbable({ ...base, disabled: true })).toBe(false)
    expect(isTabbable({ ...base, tabIndex: -1 })).toBe(false)
    expect(isTabbable({ ...base, type: 'hidden' })).toBe(false)
    expect(isTabbable({ ...base, rendered: false })).toBe(false)
  })
})

describe('open pop-up stack — only the top one handles Tab/Esc', () => {
  it('the newest pop-up is on top; closing it hands control back', () => {
    const a = pushModal()
    expect(isTopModal(a)).toBe(true)
    const b = pushModal()
    expect(isTopModal(a)).toBe(false)
    expect(isTopModal(b)).toBe(true)
    popModal(b)
    expect(isTopModal(a)).toBe(true)
    popModal(a)
    expect(isTopModal(a)).toBe(false)
  })
  it('closing a lower pop-up first does not break the top one', () => {
    const a = pushModal()
    const b = pushModal()
    popModal(a)
    expect(isTopModal(b)).toBe(true)
    popModal(b)
  })
})
