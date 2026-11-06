import { redirect } from 'next/navigation'
import { loginPath } from '@/lib/login-redirect.server'

export default async function Home() {
  redirect(await loginPath())
}
