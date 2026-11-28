// @vitest-environment jsdom
import { createElement as h, createRef, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ModalOverlay } from './modal-overlay'
import { SessionTimeoutModal } from './session-timeout-modal'

// jsdom has no layout, so every element reports zero boxes; treat them all as on screen.
beforeAll(() => {
  HTMLElement.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList
  }
})
afterEach(() => cleanup())

const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift })
const esc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

function Overlay({ onClose, children, ...rest }: { onClose: () => void; children?: ReactNode; ariaLabel?: string; returnFocusRef?: React.RefObject<HTMLElement | null> }) {
  return h(ModalOverlay, {
    onClose,
    ...rest,
    children: children ?? [h('h1', { key: 'h' }, 'Add thing'), h('button', { key: 'a' }, 'First'), h('button', { key: 'b' }, 'Last')],
  })
}

describe('ModalOverlay with the session-timeout warning on top', () => {
  it('warning keeps Tab on "Stay signed in", Esc leaves the pop-up open, and the trap comes back after', () => {
    const onClose = vi.fn()
    const view = render(h('div', null, h(Overlay, { onClose })))
    const first = screen.getByText('First')
    const last = screen.getByText('Last')

    // Pop-up alone: Tab wraps inside.
    last.focus()
    tab()
    expect(document.activeElement).toBe(first)

    // Warning appears on top.
    view.rerender(h('div', null, h(Overlay, { onClose }), h(SessionTimeoutModal, { secondsLeft: 90, onStayActive: () => {} })))
    const stay = screen.getByText('Stay signed in')
    expect(document.activeElement).toBe(stay)
    tab()
    expect(document.activeElement).toBe(stay)
    tab(true)
    expect(document.activeElement).toBe(stay)
    esc()
    expect(onClose).not.toHaveBeenCalled()

    // Warning goes away: focus returns to where it was, trap works again.
    view.rerender(h('div', null, h(Overlay, { onClose })))
    expect(document.activeElement).toBe(first)
    tab(true)
    expect(document.activeElement).toBe(last)
    tab()
    expect(document.activeElement).toBe(first)
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc on the warning does not count as "Stay signed in"', () => {
    const onStayActive = vi.fn()
    render(h(SessionTimeoutModal, { secondsLeft: 30, onStayActive }))
    esc()
    expect(onStayActive).not.toHaveBeenCalled()
  })
})

describe('ModalOverlay focus return', () => {
  function Page({ open, showOpener, returnFocusRef }: { open: boolean; showOpener: boolean; returnFocusRef?: React.RefObject<HTMLButtonElement | null> }) {
    return h('div', null,
      h('button', { ref: returnFocusRef }, 'Menu'),
      showOpener ? h('button', null, 'Opener') : null,
      h('main', { tabIndex: -1 }, 'content'),
      open ? h(Overlay, { onClose: () => {}, returnFocusRef }) : null,
    )
  }

  it('returns focus to the opener when it is still on the page', () => {
    const view = render(h(Page, { open: false, showOpener: true }))
    screen.getByText('Opener').focus()
    view.rerender(h(Page, { open: true, showOpener: true }))
    view.rerender(h(Page, { open: false, showOpener: true }))
    expect(document.activeElement).toBe(screen.getByText('Opener'))
  })

  it('opener gone: falls back to returnFocusRef', () => {
    const ref = createRef<HTMLButtonElement>()
    const view = render(h(Page, { open: false, showOpener: true, returnFocusRef: ref }))
    screen.getByText('Opener').focus()
    view.rerender(h(Page, { open: true, showOpener: false, returnFocusRef: ref }))
    view.rerender(h(Page, { open: false, showOpener: false, returnFocusRef: ref }))
    expect(document.activeElement).toBe(ref.current)
  })

  it('opener gone and no returnFocusRef: falls back to <main>', () => {
    const view = render(h(Page, { open: false, showOpener: true }))
    screen.getByText('Opener').focus()
    view.rerender(h(Page, { open: true, showOpener: false }))
    view.rerender(h(Page, { open: false, showOpener: false }))
    expect(document.activeElement).toBe(document.querySelector('main'))
  })
})

describe('ModalOverlay accessible name', () => {
  it('is a modal dialog named by its heading', () => {
    render(h(Overlay, { onClose: () => {} }))
    const dialog = screen.getByRole('dialog', { name: 'Add thing' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('uses ariaLabel when there is no heading, and warns about neither', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(h(Overlay, { onClose: () => {}, ariaLabel: 'Certificate preview' }, h('button', null, 'OK')))
    expect(screen.getByRole('dialog', { name: 'Certificate preview' })).toBeTruthy()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns in development when the pop-up has no name at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(h(Overlay, { onClose: () => {} }, h('button', null, 'OK')))
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('picks up a heading that appears later (e.g. a success screen)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(h(Overlay, { onClose: () => {}, ariaLabel: 'Fallback' }, h('div', { id: 'slot' })))
    expect(screen.getByRole('dialog', { name: 'Fallback' })).toBeTruthy()
    await act(async () => {
      const heading = document.createElement('h2')
      heading.textContent = 'Saved'
      document.getElementById('slot')!.appendChild(heading)
    })
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Saved' })).toBeTruthy())
    warn.mockRestore()
  })

  it('leaves content that is already a dialog alone (logout confirm)', () => {
    render(h(Overlay, { onClose: () => {} }, h('div', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Log out?' }, h('button', null, 'Cancel'))))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alertdialog', { name: 'Log out?' })).toBeTruthy()
  })
})
