-- Review Finding 2 (full security review, 10 Nov 2026): a Champion could take
-- over a Gatekeeper account — change its email to their own address, confirm
-- it, then press "Resend invite", which set and emailed a new password — and
-- with it read the Gatekeeper's private mood check-ins.
--
-- Rules after this migration (enforced here as well as in the server actions;
-- they apply to trusted server code too, because both tables below are only
-- ever written with the service role):
--   * A sign-in email change for someone else (email_change_requests) may be
--     started and confirmed only by an active Super Admin, or by an active
--     Champion of the Gatekeeper's own club while that Gatekeeper account has
--     never been signed into (correcting a typo before first sign-in).
--   * A set-password link (account_setup_invites, new) may only be created
--     for, and used on, an account that has never been signed into, by the
--     same people. No password is ever stored, shown or emailed.
--   * Confirming an email change ends all of that account's sessions
--     (revoke_user_sessions, called by the server).
-- Profiles' email column was already writable only by trusted server code
-- (guard_profile_update, Security Finding 3); that stays as it is.

-- ── Helpers (server and triggers only; no client may call them) ──────────────

-- True once the account has signed in at least once. An unknown account
-- counts as signed in, so every rule built on this fails closed.
CREATE OR REPLACE FUNCTION public.account_has_signed_in(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT u.last_sign_in_at IS NOT NULL FROM auth.users u WHERE u.id = p_user_id), true)
$$;
REVOKE ALL ON FUNCTION public.account_has_signed_in(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_signed_in(uuid) TO service_role;

-- May p_actor change how p_target signs in (email, set-password link)?
CREATE OR REPLACE FUNCTION public.can_manage_account_sign_in(p_actor uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles a
    JOIN public.profiles t ON t.id = p_target
    WHERE a.id = p_actor
      AND a.is_active
      AND (
        a.role = 'super_admin'
        OR (a.role = 'champion'
            AND t.role = 'gatekeeper'
            AND a.club_id IS NOT NULL
            AND t.club_id = a.club_id
            AND NOT public.account_has_signed_in(p_target))
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_account_sign_in(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_account_sign_in(uuid, uuid) TO service_role;

-- Ends every session of one account (refresh tokens first, then sessions).
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

-- ── Email changes for someone else ───────────────────────────────────────────
-- Checked when a request is created and again when it is confirmed (the
-- Gatekeeper may have signed in, or the requester been deactivated, since).
CREATE OR REPLACE FUNCTION public.guard_email_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL) THEN
    IF NEW.requested_by IS NULL OR NOT public.can_manage_account_sign_in(NEW.requested_by, NEW.user_id) THEN
      RAISE EXCEPTION 'Only a Super Admin can change this sign-in email.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_email_change_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_change_requests_guard ON public.email_change_requests;
CREATE TRIGGER trg_email_change_requests_guard
  BEFORE INSERT OR UPDATE OF confirmed_at ON public.email_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_email_change_request();

-- ── Set-password links ───────────────────────────────────────────────────────
-- Replaces "resend invite" setting and emailing a new password. Only the
-- SHA-256 hash of the link's token is stored. Server code only: no client can
-- read or write this table.
CREATE TABLE IF NOT EXISTS public.account_setup_invites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash    text        NOT NULL UNIQUE,
  requested_by  uuid        REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  cancelled_at  timestamptz,
  CONSTRAINT account_setup_invites_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_account_setup_invites_user ON public.account_setup_invites(user_id);

ALTER TABLE public.account_setup_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_setup_invites FROM anon, authenticated;
-- Same "active users only" rule as every other table (Security Finding 2).
DROP POLICY IF EXISTS "active users only" ON public.account_setup_invites;
CREATE POLICY "active users only" ON public.account_setup_invites AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());

CREATE OR REPLACE FUNCTION public.guard_account_setup_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_by IS NULL OR NOT public.can_manage_account_sign_in(NEW.requested_by, NEW.user_id) THEN
      RAISE EXCEPTION 'You can’t send a set-password link for this account.' USING ERRCODE = '42501';
    END IF;
    IF public.account_has_signed_in(NEW.user_id) THEN
      RAISE EXCEPTION 'This account has already been signed into.' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.used_at IS NULL AND NEW.used_at IS NOT NULL THEN
    IF OLD.cancelled_at IS NOT NULL OR OLD.expires_at <= now() OR public.account_has_signed_in(NEW.user_id) THEN
      RAISE EXCEPTION 'This set-password link can no longer be used.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_account_setup_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_account_setup_invites_guard ON public.account_setup_invites;
CREATE TRIGGER trg_account_setup_invites_guard
  BEFORE INSERT OR UPDATE OF used_at ON public.account_setup_invites
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_setup_invite();
