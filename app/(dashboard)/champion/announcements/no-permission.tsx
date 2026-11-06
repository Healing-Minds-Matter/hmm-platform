import { NO_PERMISSION_MESSAGE } from './permission-message'

export function NoAnnouncementPermission() {
  return (
    <div role="alert" className="mx-auto w-full max-w-[560px] rounded-2xl bg-white p-6 text-[14px] text-[#475569] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
      {NO_PERMISSION_MESSAGE}
    </div>
  )
}
