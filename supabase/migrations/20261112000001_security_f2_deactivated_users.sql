-- Security go-live Finding 2: a deactivated user can't read or change anything.
--
-- 1. is_active_user(): the one helper every access rule uses. False for a
--    signed-out caller, a caller with no profile, and a deactivated caller.
-- 2. An "active users only" RESTRICTIVE policy on every table that has Row
--    Level Security, and on storage.objects. Restrictive policies are ANDed
--    with all the existing (permissive) ones, so every existing rule — and any
--    route that goes through RLS: the web app, the mobile app, realtime and
--    direct API calls — now also requires an active account, without
--    rewriting each policy. Realtime postgres_changes applies the same RLS.
-- 3. current_user_role() / current_user_club_id() return NULL for a
--    deactivated caller, so SECURITY DEFINER functions that check the role
--    (save_event, event_registrants, cert_can, …) refuse them too.
--    Two functions whose checks a NULL role would have flipped open are fixed
--    here: effective_permission() and protect_profile_privileged_fields().
-- 4. my_account_status(): the only thing a deactivated user can still read —
--    their own status — so the web and mobile apps can say why they were
--    signed out.
-- 5. Deactivating a user ends all of their sessions (refresh tokens), by
--    trigger, whichever route deactivated them (manual, club cascade).
--    Reactivating restores access at their next sign-in.
--
-- NOTE for future migrations: a new table with RLS needs the same
-- "active users only" policy (see the loop below).

-- Fail fast if this database role can't revoke sessions (step 5).
DO $$
BEGIN
  IF NOT has_table_privilege('auth.sessions', 'DELETE') OR NOT has_table_privilege('auth.refresh_tokens', 'DELETE') THEN
    RAISE EXCEPTION 'This role cannot delete from auth.sessions / auth.refresh_tokens; run this migration as postgres.';
  END IF;
END $$;

-- ── 1. The helper ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- ── 2. Restrictive "active users only" policy everywhere ────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "active users only" ON %I.%I', t.schema_name, t.table_name);
    EXECUTE format(
      'CREATE POLICY "active users only" ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.is_active_user()) WITH CHECK (public.is_active_user())',
      t.schema_name, t.table_name);
  END LOOP;
END $$;

-- ── 3. Role helpers: no role for a deactivated caller ──────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.current_user_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

-- Was `p_user_id <> auth.uid() AND current_user_role() <> 'super_admin'`:
-- with no caller (or, after step 3, a deactivated one) both sides are NULL,
-- the IF is skipped, and anyone's permissions could be read.
CREATE OR REPLACE FUNCTION public.effective_permission(p_user_id UUID, p_permission TEXT)
RETURNS TABLE (is_enabled BOOLEAN, source public.permission_source, source_detail JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_individual public.role_overrides;
  v_role       public.user_role;
  v_role_row   public.permissions;
  v_deny_groups JSONB;
  v_allow_groups JSONB;
BEGIN
  IF NOT public.is_active_user()
     OR (p_user_id IS DISTINCT FROM auth.uid() AND public.current_user_role() IS DISTINCT FROM 'super_admin') THEN
    RAISE EXCEPTION 'not authorized to resolve permissions for this user' USING ERRCODE = '42501';
  END IF;

  -- 1. Individual exception - highest precedence.
  SELECT * INTO v_individual FROM public.role_overrides
    WHERE user_id = p_user_id AND permission = p_permission;
  IF FOUND THEN
    RETURN QUERY SELECT v_individual.is_enabled, 'individual'::public.permission_source,
      jsonb_build_object('role_override_id', v_individual.id);
    RETURN;
  END IF;

  -- 2. Group settings - deny-overrides if multiple groups disagree.
  SELECT jsonb_agg(jsonb_build_object('id', pg.id, 'name', pg.name))
    INTO v_deny_groups
    FROM public.group_permissions gp
    JOIN public.group_members gm ON gm.group_id = gp.group_id
    JOIN public.permission_groups pg ON pg.id = gp.group_id
    WHERE gm.user_id = p_user_id AND gp.permission = p_permission AND gp.is_enabled = FALSE;

  IF v_deny_groups IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'group'::public.permission_source,
      jsonb_build_object('denying_groups', v_deny_groups);
    RETURN;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', pg.id, 'name', pg.name))
    INTO v_allow_groups
    FROM public.group_permissions gp
    JOIN public.group_members gm ON gm.group_id = gp.group_id
    JOIN public.permission_groups pg ON pg.id = gp.group_id
    WHERE gm.user_id = p_user_id AND gp.permission = p_permission AND gp.is_enabled = TRUE;

  IF v_allow_groups IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 'group'::public.permission_source,
      jsonb_build_object('allowing_groups', v_allow_groups);
    RETURN;
  END IF;

  -- 3. Role default - fallback.
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_role_row FROM public.permissions
    WHERE role = v_role AND permission = p_permission;

  IF FOUND THEN
    RETURN QUERY SELECT v_role_row.is_enabled, 'role'::public.permission_source,
      jsonb_build_object('permission_id', v_role_row.id);
  ELSE
    RETURN QUERY SELECT FALSE, 'role'::public.permission_source,
      jsonb_build_object('note', 'no role default configured');
  END IF;
END;
$$;

-- Same NULL problem: `current_user_role() <> 'super_admin'` is NULL (so the
-- protection is skipped) when the role is NULL. (Finding 3 widens this list.)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'super_admin' AND auth.uid() = NEW.id THEN
    NEW.role                = OLD.role;
    NEW.club_id             = OLD.club_id;
    NEW.is_active           = OLD.is_active;
    NEW.deactivation_reason = OLD.deactivation_reason;
    NEW.deactivated_club_id = OLD.deactivated_club_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Own status, readable even when deactivated ──────────────────────────
CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS TABLE (role public.user_role, is_active boolean, deactivation_reason public.deactivation_reason, must_change_password boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.is_active, p.deactivation_reason, p.must_change_password
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_status() TO authenticated;

-- ── 5. Deactivation ends every session ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_sessions_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    DELETE FROM auth.refresh_tokens WHERE user_id = NEW.id::text;
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_sessions_on_deactivation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_revoke_sessions ON public.profiles;
CREATE TRIGGER trg_profiles_revoke_sessions
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_sessions_on_deactivation();
