// @vitest-environment jsdom
import { createElement as h, createRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MobileNavDrawer } from './mobile-nav-drawer'
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

// Header menu button + the panel, wired the same way as dashboard-client-layout.tsx.
const buttonRef = createRef<HTMLButtonElement>()
function Harness({ warning = false }: { warning?: boolean }) {
  const [open, setOpen] = useState(false)
  return h('div', null,
    h('button', { ref: buttonRef, 'aria-expanded': open, onClick: () => setOpen(true) }, 'Open menu'),
    h(MobileNavDrawer, {
      open,
      onClose: () => setOpen(false),
      returnFocusRef: buttonRef,
      children: h('nav', null,
        h('a', { href: '#dashboard', onClick: (e: Event) => e.preventDefault() }, 'Dashboard'),
        h('a', { href: '#clubs', onClick: (e: Event) => e.preventDefault() }, 'Clubs'),
      ),
    }),
    warning ? h(SessionTimeoutModal, { secondsLeft: 90, onStayActive: () => {} }) : null,
  )
}

const panel = () => screen.getByRole('dialog', { name: 'Main menu', hidden: true })
const isOpen = () => panel().className.includes('visible translate-x-0')

function openMenu() {
  const button = screen.getByText('Open menu')
  button.focus()
  fireEvent.click(button)
  return button
}

describe('MobileNavDrawer (phone menu)', () => {
  it('is closed and hidden to start with', () => {
    render(h(Harness))
    expect(isOpen()).toBe(false)
    expect(panel().className).toContain('invisible')
    expect(screen.getByText('Open menu').getAttribute('aria-expanded')).toBe('false')
  })

  it('opens from the menu button and moves focus inside, onto Close menu', () => {
    render(h(Harness))
    const button = openMenu()
    expect(isOpen()).toBe(true)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close menu' }))
    expect(panel().getAttribute('aria-modal')).toBe('true')
  })

  it('keeps Tab and Shift+Tab inside the panel', () => {
    render(h(Harness))
    openMenu()
    const close = screen.getByRole('button', { name: 'Close menu' })
    const clubs = screen.getByText('Clubs')
    clubs.focus()
    tab()
    expect(document.activeElement).toBe(close)
    tab(true)
    expect(document.activeElement).toBe(clubs)
  })

  it('Esc closes it and focus goes back to the menu button', () => {
    render(h(Harness))
    const button = openMenu()
    esc()
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('clicking the dark backdrop closes it', () => {
    render(h(Harness))
    const button = openMenu()
    fireEvent.click(screen.getByTestId('mobile-nav-backdrop'))
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('clicking a link closes it', () => {
    render(h(Harness))
    const button = openMenu()
    fireEvent.click(screen.getByText('Clubs'))
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('the Close menu button closes it', () => {
    render(h(Harness))
    const button = openMenu()
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('clicks elsewhere inside the panel (not a link) leave it open', () => {
    render(h(Harness))
    openMenu()
    fireEvent.click(screen.getByRole('navigation', { hidden: true }))
    expect(isOpen()).toBe(true)
  })

  it('leaves Esc to the session-timeout warning when that is on top', () => {
    const view = render(h(Harness))
    openMenu()
    view.rerender(h(Harness, { warning: true }))
    screen.getByRole('button', { name: /stay signed in/i }).focus()
    esc()
    expect(isOpen()).toBe(true)
  })

  it('a closed panel ignores Esc and Tab', () => {
    render(h(Harness))
    const button = screen.getByText('Open menu')
    button.focus()
    esc()
    tab()
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(button)
  })
})
