// Security Finding 3: shown after saving an Edit Champion / Edit Gatekeeper
// form whose email was changed. The new sign-in email only applies once the
// new address confirms the link we emailed.
export function EmailPendingNotice({ email, onDone }: { email: string; onDone: () => void }) {
  return (
    <div className="rounded-lg bg-[#EFF4FF] p-3 text-sm text-[#1E3A8A]" role="status">
      <p>
        Changes saved. We emailed a confirmation link to <span className="font-semibold">{email}</span>. The sign-in
        email changes only once that link is confirmed (it expires in 24 hours); until then the current email keeps
        working. The current address was told about the request.
      </p>
      <button type="button" onClick={onDone} className="mt-2 font-semibold underline">
        Done
      </button>
    </div>
  )
}

export const EMAIL_CHANGE_HINT = 'Changing this sends a confirmation link to the new address; it applies once confirmed.'
