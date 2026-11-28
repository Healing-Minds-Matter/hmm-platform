// Login / forgot-password illustration (components/auth/auth-illustration-panel.tsx).
//
// The panel is only shown from Tailwind's `lg` breakpoint (1024px) up. It used
// to be hidden on smaller screens with CSS alone, but the browser still
// downloaded its images (~880 KB) on phones. The panel now adds the <image>
// elements only once the screen is known to be wide enough; these helpers hold
// that check so it can be unit-tested without a browser.

/** Same width as Tailwind's `lg` breakpoint, which shows the panel (`lg:flex`). */
export const ILLUSTRATION_MEDIA_QUERY = '(min-width: 1024px)'

/** Image files the panel draws. Re-encoded smaller in Fix S; same pixel sizes. */
export const ILLUSTRATION_IMAGES = {
  photo: '/images/login/photo.jpg',
  roomBackground: '/images/login/room-bg.webp',
  logoBadge: '/images/login/logo-badge.png',
} as const

type MediaWindow = Pick<Window, 'matchMedia'>

function currentWindow(): MediaWindow | undefined {
  return typeof window === 'undefined' ? undefined : window
}

/** True when the illustration should be drawn. False on the server and on narrow screens. */
export function isIllustrationScreen(win: MediaWindow | undefined = currentWindow()): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false
  return win.matchMedia(ILLUSTRATION_MEDIA_QUERY).matches
}

/** useSyncExternalStore subscribe: re-check when the window crosses the breakpoint. */
export function subscribeToIllustrationScreen(
  onChange: () => void,
  win: MediaWindow | undefined = currentWindow(),
): () => void {
  if (!win || typeof win.matchMedia !== 'function') return () => {}
  const query = win.matchMedia(ILLUSTRATION_MEDIA_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
