// Fix T: the light placeholder shown straight away while the next Super Admin
// or Champion page loads (used by app/(dashboard)/{super-admin,champion}/loading.tsx).
//
// It sits inside the dashboard's <main>, so the sidebar and header stay put.
// Same padding and title size as the real pages, so nothing jumps when the
// page arrives. No data, no client JS — it has to render instantly.

const ROWS = 5

export function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-6 p-8 font-[family-name:var(--font-inter)]"
    >
      <span className="sr-only">Loading page…</span>

      {/* Page title + subtitle */}
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-7 w-48 max-w-[70%] rounded-md bg-[#E2E8F0] motion-safe:animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-[#E2E8F0] motion-safe:animate-pulse" />
      </div>

      {/* Content card with a few rows */}
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
      >
        <div className="h-11 border-b border-[#E2E8F0] bg-[#F8FAFC]" />
        {Array.from({ length: ROWS }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-[rgba(226,232,240,0.5)] px-4 py-4 first:border-t-0"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-[#E2E8F0] motion-safe:animate-pulse" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-3.5 w-1/2 rounded bg-[#E2E8F0] motion-safe:animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-[#EEF2F6] motion-safe:animate-pulse" />
            </div>
            <div className="hidden h-6 w-20 shrink-0 rounded-full bg-[#EEF2F6] motion-safe:animate-pulse sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
