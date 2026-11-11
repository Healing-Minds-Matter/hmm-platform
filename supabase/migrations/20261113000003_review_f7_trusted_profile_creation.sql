-- Review Finding 7: profiles (and official certificates) are only created by
-- trusted server code.
--
-- 1. Drop the legacy "profiles: champion insert gatekeeper" policy. It let a
--    Champion's own client write a Gatekeeper profile directly — any field,
--    including profiles.qpr_certification_date, which the legacy trigger
--    turned into an official QPR certificate without the
--    certifications.award permission check. The app adds Gatekeepers through
--    server code (service role, after the requireRole / club-scope guards);
--    nothing used this policy.
-- 2. guard_profile_insert(): a profile written by a signed-in client (not the
--    server) must come from an active Super Admin, be a Champion or a
--    Gatekeeper, and carry no legacy QPR date. (RLS already limits inserts to
--    Super Admins; this is the second lock and pins the fields.) The server
--    (service role) keeps creating profiles after its own guards.
-- 3. profiles_qpr_to_certificates(): the legacy QPR date → certificate sync
--    now requires the same permissions as the certificate screens when a
--    signed-in client triggers it (award / edit / remove, for someone in the
--    caller's scope). Server and system writes are unchanged.
-- 4. Remove a Supabase-template sign-up trigger (handle_new_user) if one was
--    ever added in the dashboard: a self-signed-up account must get no
--    profile, and so no access (every access rule needs an active profile).
--    The app never relied on it — it creates each profile itself.

-- ── 1. ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles: champion insert gatekeeper" ON public.profiles;

-- ── 2. ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.cert_is_system() THEN
    RETURN NEW;  -- the server (service role, after its guards) or the database itself
  END IF;
  IF NOT public.is_active_user() OR public.current_user_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only the server can create accounts.' USING ERRCODE = '42501';
  END IF;
  IF NEW.role NOT IN ('champion', 'gatekeeper') THEN
    RAISE EXCEPTION 'Only Champion and Gatekeeper accounts can be created here.' USING ERRCODE = '42501';
  END IF;
  IF NEW.qpr_certification_date IS NOT NULL OR NEW.qpr_expiry_date IS NOT NULL THEN
    RAISE EXCEPTION 'Certificates are added on the certificates screen, not with the account.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard_insert ON public.profiles;
CREATE TRIGGER trg_profiles_guard_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert();

-- ── 3. ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_qpr_to_certificates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type uuid := (SELECT id FROM public.certification_types WHERE code = 'QPR');
  v_cur public.certificates;
  v_needed text;
BEGIN
  IF public.cert_syncing() OR v_type IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.qpr_certification_date IS NOT DISTINCT FROM OLD.qpr_certification_date THEN RETURN NEW; END IF;
  SELECT * INTO v_cur FROM public.certificates
  WHERE holder_id = NEW.id AND type_id = v_type AND removed_at IS NULL
  ORDER BY achieved_on DESC, created_at DESC LIMIT 1;

  -- Review Finding 7: a signed-in client needs the certificate permission
  -- for what this would do, for someone in their scope.
  IF NOT public.cert_is_system() THEN
    v_needed := CASE
      WHEN NEW.qpr_certification_date IS NOT NULL AND v_cur.id IS NULL THEN 'certifications.award'
      WHEN NEW.qpr_certification_date IS NOT NULL THEN 'certifications.official.edit'
      WHEN v_cur.id IS NOT NULL THEN 'certifications.official.remove'
    END;
    IF v_needed IS NOT NULL AND NOT (public.cert_in_scope(NEW.id) AND public.cert_can(v_needed)) THEN
      RAISE EXCEPTION 'You don’t have permission to change this person’s certificates.' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('hmm.cert_legacy', 'on', true);
  IF NEW.qpr_certification_date IS NOT NULL THEN
    IF v_cur.id IS NULL THEN
      INSERT INTO public.certificates (holder_id, type_id, achieved_on, format) VALUES (NEW.id, v_type, NEW.qpr_certification_date, 'physical');
    ELSIF v_cur.achieved_on <> NEW.qpr_certification_date THEN
      UPDATE public.certificates SET achieved_on = NEW.qpr_certification_date WHERE id = v_cur.id;
    END IF;
  ELSIF v_cur.id IS NOT NULL THEN
    UPDATE public.certificates SET removed_at = now(), removed_reason_category = 'Other',
      removed_reason = 'The certification date was cleared in the Gatekeeper form.'
    WHERE id = v_cur.id;
  END IF;
  PERFORM set_config('hmm.cert_legacy', 'off', true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_qpr_to_certificates() FROM PUBLIC, anon, authenticated;

-- ── 4. ──────────────────────────────────────────────────────────────────────
-- CASCADE drops whatever trigger calls it, under any name.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
