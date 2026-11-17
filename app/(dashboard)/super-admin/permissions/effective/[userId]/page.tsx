import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EffectivePermissionsTable, roleLabel, type EffectiveRow } from '../effective-permissions-table'

export default async function EffectivePermissionsPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const supabase = await createClient()

  const { data: user } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', userId)
    .in('role', ['champion', 'gatekeeper'])
    .maybeSingle()

  if (!user) notFound()

  const { data: rows, error } = await supabase.rpc('list_effective_permissions', { p_user_id: userId })
  const effectiveRows = (rows ?? []) as EffectiveRow[]

  const backHref = user.role === 'champion' ? `/super-admin/champions/${userId}` : '/super-admin/champions'

  return (
    <div className="p-8 font-[family-name:var(--font-inter)]">
      <Link href={backHref} className="text-[13px] font-semibold text-[#1E4BB8] hover:underline">
        ← Back to {user.role === 'champion' ? user.full_name : 'Champions'}
      </Link>
      <h1 className="mt-3 text-[22px] font-bold tracking-[-0.22px] text-[#0F172A] font-[family-name:var(--font-jakarta)]">
        Effective Permissions
      </h1>
      <p className="mt-1 text-[13px] text-[#475569]">
        {user.full_name} · <span className="capitalize">{roleLabel(user.role)}</span>
        {!user.is_active && <span className="ml-2 text-[11px] text-[#DC2626]">(inactive)</span>}
      </p>
      <p className="mt-4 max-w-2xl text-[13px] leading-5 text-[#475569]">
        For each permission below, the effective result and the layer that decided it —
        an Individual Exception always wins over a Group setting, which always wins over
        the Role Default.
      </p>

      <div className="mt-6">
        {error ? (
          <div className="rounded-xl bg-white p-12 text-center text-sm text-red-600 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
            This person&apos;s permissions couldn&apos;t be loaded. Please refresh the page and try again.
          </div>
        ) : (
          <EffectivePermissionsTable rows={effectiveRows} roleName={roleLabel(user.role)} />
        )}
      </div>
    </div>
  )
}
