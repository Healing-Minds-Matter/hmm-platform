-- Review Finding 8: Super Admins need two-step verification (an
-- authenticator-app code, Supabase MFA / TOTP) — in the database too.
--
-- The web app sends a Super Admin to the verification page until their
-- session is "aal2" (password + authenticator code). This is the second lock:
-- without it, a stolen Super Admin password alone would still work against
-- the API directly.
--
-- is_active_user() — used by the "active users only" restrictive policy on
-- every RLS table and storage.objects, and by the SECURITY DEFINER functions —
-- now also requires an aal2 session for a Super Admin. current_user_role() /
-- current_user_club_id(), and the certificate helpers cert_can() /
-- cert_in_scope(), use it too, so role-checking functions refuse a Super
-- Admin who hasn't verified (and cert_can / cert_in_scope pick up Finding 6's
-- active-club rule).
--
-- Champions and Gatekeepers are unaffected. my_account_status() stays
-- readable (so the web can tell a Super Admin to verify rather than "your
-- account is deactivated").
--
-- ROLL-OUT: deploy the web app (with the verification page) BEFORE applying
-- this migration, or signed-in Super Admins lose access with nowhere to verify.

CREATE OR REPLACE FUNCTION public.session_meets_role_assurance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
$$;
REVOKE ALL ON FUNCTION public.session_meets_role_assurance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_meets_role_assurance() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.account_is_active(auth.uid()) AND public.session_meets_role_assurance()
$$;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND public.is_active_user()
$$;

CREATE OR REPLACE FUNCTION public.current_user_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.profiles WHERE id = auth.uid() AND public.is_active_user()
$$;

CREATE OR REPLACE FUNCTION public.cert_can(p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  v_restricted text;
BEGIN
  IF public.cert_is_system() THEN RETURN true; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND public.is_active_user();
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'super_admin' THEN RETURN p_permission <> 'certifications.self.manage'; END IF;
  SELECT restricted_to INTO v_restricted FROM public.permission_catalog WHERE key = p_permission;
  IF v_restricted = 'super_admin' THEN RETURN false; END IF;
  IF public.cert_effective_unchecked(auth.uid(), p_permission) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.v_active_role_delegations rd
                 WHERE rd.delegate_id = auth.uid() AND public.cert_effective_unchecked(rd.delegator_id, p_permission));
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_in_scope(p_holder uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me public.profiles;
  v_holder public.profiles;
BEGIN
  IF public.cert_is_system() THEN RETURN true; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid() AND public.is_active_user();
  SELECT * INTO v_holder FROM public.profiles WHERE id = p_holder;
  IF v_me.id IS NULL OR v_holder.id IS NULL THEN RETURN false; END IF;
  IF v_me.role = 'super_admin' THEN RETURN v_holder.role IN ('champion', 'gatekeeper'); END IF;
  IF v_me.role = 'champion' THEN
    RETURN v_holder.role = 'gatekeeper' AND v_holder.club_id = v_me.club_id AND v_holder.id <> v_me.id;
  END IF;
  RETURN false;
END;
$$;
