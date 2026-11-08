// The support contact shown on the Help page. Set NEXT_PUBLIC_SUPPORT_EMAIL in
// the environment (Vercel project settings, and .env.local for development).
export function supportEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
}
