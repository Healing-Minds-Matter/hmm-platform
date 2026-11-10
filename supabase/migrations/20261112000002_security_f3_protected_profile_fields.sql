-- Security go-live Finding 3: users can only change their own safe profile
-- fields; protected fields change only through authorised routes.
--
-- Replaces protect_profile_privileged_fields(), which silently pinned just
-- five columns (role, club_id, is_active, deactivation_reason,
-- deactivated_club_id) and only for self-edits. Everything else — email,
-- the old QPR dates (which create an official QPR certificate through
-- profiles_qpr_to_certificates), gatekeeper_code, must_change_password,
-- created_at, avatar_url — could be changed by the user directly.
--
-- Who may change what (any refused change raises 42501, nothing is silently
-- dropped):
--   * Trusted server code (service role) and the certificate sync: anything.
--   * Nobody else may change id, created_at or email. Email changes go
--     through a verified flow on the server (email_change_requests below and
--     the Super Admin's own Supabase "change email" flow).
--   * Active Super Admin: every other column.
--   * Champion, on a Gatekeeper of their own club (RLS already limits which
--     rows): the safe fields plus is_active / deactivation_reason /
--     deactivated_club_id (deactivate / reactivate).
--   * Anyone on their own row: the safe fields only —
--     full_name, phone, title, preferred_language, office_location, avatar_url
--     (updated_at and version are maintained by triggers).
--   * avatar_url must point into the caller's own folder of the avatars bucket.

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role    public.user_role := public.current_user_role();
  v_safe    text[] := ARRAY['full_name', 'phone', 'title', 'preferred_language', 'office_location', 'avatar_url', 'updated_at', 'version'];
  v_allowed text[];
  v_changed text[];
  v_refused text[];
BEGIN
  IF public.cert_is_system() OR public.cert_syncing() THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(n.key), '{}') INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n
  WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key;

  IF v_role = 'super_admin' THEN
    v_allowed := (SELECT array_agg(k) FROM jsonb_object_keys(to_jsonb(NEW)) k WHERE k NOT IN ('id', 'created_at', 'email'));
  ELSIF v_role = 'champion' AND NEW.id <> auth.uid() AND OLD.role = 'gatekeeper' THEN
    v_allowed := v_safe || ARRAY['is_active', 'deactivation_reason', 'deactivated_club_id'];
  ELSE
    v_allowed := v_safe;
  END IF;

  SELECT coalesce(array_agg(c), '{}') INTO v_refused FROM unnest(v_changed) c WHERE c <> ALL (v_allowed);
  IF cardinality(v_refused) > 0 THEN
    RAISE EXCEPTION 'You can’t change: %', array_to_string(v_refused, ', ') USING ERRCODE = '42501';
  END IF;

  IF 'avatar_url' = ANY (v_changed) AND NEW.avatar_url IS NOT NULL
     AND position(('/storage/v1/object/public/avatars/' || NEW.id::text || '/') IN NEW.avatar_url) = 0 THEN
    RAISE EXCEPTION 'The profile picture must be uploaded to your own profile.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileged_fields ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_guard_update ON public.profiles;
CREATE TRIGGER trg_profiles_guard_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- The old function is no longer used by any trigger.
DROP FUNCTION IF EXISTS public.protect_profile_privileged_fields();

-- ── Email changes started by a Super Admin or Champion for someone else ─────
-- The change only applies when the NEW address confirms a one-time link
-- (actions: lib/email-change.server.ts). Only the token's SHA-256 hash is
-- stored. Server code only: no client can read or write this table.
CREATE TABLE IF NOT EXISTS public.email_change_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  new_email     text        NOT NULL,
  token_hash    text        NOT NULL UNIQUE,
  requested_by  uuid        REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  confirmed_at  timestamptz,
  cancelled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_change_requests_user ON public.email_change_requests(user_id);

ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_change_requests FROM anon, authenticated;
-- Same "active users only" rule as every other table (Finding 2).
DROP POLICY IF EXISTS "active users only" ON public.email_change_requests;
CREATE POLICY "active users only" ON public.email_change_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
