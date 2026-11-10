-- Security go-live Finding 5: who may call database functions, permission
-- data, and the append-only audit log.
--
-- 1. EXECUTE on every function in schema public is revoked from PUBLIC, anon
--    and authenticated, then granted back to `authenticated` only for:
--      a) functions the web or mobile app calls (supabase.rpc), and
--      b) functions the access rules, views and user-run triggers call as the
--         signed-in user (current_user_role(), user_can_see_event(), …), and
--         small pure helpers they use (sl_today(), cert_syncing(), …).
--    Nothing is granted to anon. The server (service_role) keeps EXECUTE on
--    everything. Trigger functions need no grant (triggers don't check it).
--    Future functions: no EXECUTE for PUBLIC/anon/authenticated by default —
--    every new client-callable function needs an explicit GRANT.
-- 2. SECURITY DEFINER functions: fixed search_path on the two that lacked it;
--    caller checks added where a client-callable one had none
--    (certification_stats, list_effective_permissions) or where an
--    inactive/signed-out caller fell through (user_can_see_event,
--    announcement_reaches_me).
-- 3. Permission data: v_active_role_delegations ran with its owner's rights
--    (anyone could read every active delegation); it now applies the
--    caller's access rules (own delegations, or Super Admin).
-- 4. audit_logs: clients can't insert, update or delete (no grants, as well
--    as no policies); nobody can update an entry; only trusted server code
--    may delete (used solely to clean up throwaway test accounts).

-- ── 1. Function grants ──────────────────────────────────────────────────────
DO $$
DECLARE
  f record;
  v_client text[] := ARRAY[
    -- a) called by the apps
    'announcement_recipient_count', 'announcement_source_labels', 'cert_can', 'cert_in_scope',
    'certification_stats', 'club_certified_people', 'edit_certificate', 'event_details_extra',
    'event_registrants', 'event_registration_counts', 'list_effective_permissions', 'my_access_list',
    'my_account_status', 'remove_certificate', 'restore_certificate', 'review_self_reported',
    'save_announcement', 'save_event',
    -- b) called as the user by access rules, views and user-run triggers/functions
    'current_user_role', 'current_user_club_id', 'is_active_user', 'user_can_see_event',
    'announcement_reaches_me', 'announcement_linked_to_my_club', 'champion_can_manage_event',
    'champion_can_link_event', 'champion_can_link_announcement', 'event_registration_refusal',
    'cert_type_retired', 'cert_stopped_on',
    --    pure helpers (no data access)
    'sl_today', 'cert_is_system', 'cert_syncing', 'cert_legacy', 'cert_expiry', 'cert_validity_text',
    'cert_check_date', 'normalize_phone'
  ];
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')  -- skip extension functions
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', f.proname, f.args);
    IF NOT f.is_trigger AND f.proname = ANY (v_client) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.proname, f.args);
    END IF;
  END LOOP;
END $$;

-- Future functions: nothing by default (Postgres grants EXECUTE to PUBLIC,
-- and Supabase to anon/authenticated, unless told otherwise).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ── 2. SECURITY DEFINER functions ──────────────────────────────────────────
ALTER FUNCTION public.effective_permission_with_delegation(UUID, TEXT) SET search_path = public;

-- Was a plain query: for a caller without the right it returned an empty
-- list or failed half-way. Now: signed in, active, and yourself or a Super Admin.
CREATE OR REPLACE FUNCTION public.list_effective_permissions(p_user_id UUID)
RETURNS TABLE (permission TEXT, is_enabled BOOLEAN, source public.permission_source, source_detail JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user()
     OR (p_user_id IS DISTINCT FROM auth.uid() AND public.current_user_role() IS DISTINCT FROM 'super_admin') THEN
    RAISE EXCEPTION 'not authorized to resolve permissions for this user' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT k.permission, ep.is_enabled, ep.source, ep.source_detail
  FROM (
    SELECT DISTINCT p.permission FROM public.permissions p
      JOIN public.profiles pr ON pr.role = p.role WHERE pr.id = p_user_id
    UNION
    SELECT DISTINCT ro.permission FROM public.role_overrides ro WHERE ro.user_id = p_user_id
    UNION
    SELECT DISTINCT gp.permission FROM public.group_permissions gp
      JOIN public.group_members gm ON gm.group_id = gp.group_id WHERE gm.user_id = p_user_id
  ) k
  CROSS JOIN LATERAL public.effective_permission(p_user_id, k.permission) ep;
END;
$$;

-- Platform-wide certified counts (mobile Home): active signed-in users only.
CREATE OR REPLACE FUNCTION public.certification_stats()
RETURNS TABLE (total_certified BIGINT, certified_this_month BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    count(DISTINCT cs.holder_id) AS total_certified,
    count(DISTINCT cs.holder_id) FILTER (
      WHERE cs.achieved_on >= date_trunc('month', public.sl_today())::date
    ) AS certified_this_month
  FROM public.certificate_statuses cs
  JOIN public.profiles p ON p.id = cs.holder_id
  WHERE public.is_active_user()
    AND cs.is_current
    AND cs.removed_at IS NULL
    AND cs.status IN ('valid', 'expiring_soon')
    AND p.is_active
    AND p.role IN ('champion', 'gatekeeper');
$$;

-- "All clubs" events were visible to any caller, even signed out or deactivated.
CREATE OR REPLACE FUNCTION public.user_can_see_event(p_event_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_active_user() AND (
    public.current_user_role() = 'super_admin'
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.is_all_clubs)
    OR EXISTS (
      SELECT 1 FROM public.event_clubs ec
      WHERE ec.event_id = p_event_id AND ec.club_id = public.current_user_club_id()
    )
  );
$$;

-- "All clubs"/"everyone" announcements reached any caller, even signed out.
CREATE OR REPLACE FUNCTION public.announcement_reaches_me(p_announcement_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_active_user() AND (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.announcements a
      WHERE a.id = p_announcement_id
        AND (
          (
            EXISTS (SELECT 1 FROM public.announcement_clubs ac
                    WHERE ac.announcement_id = a.id AND ac.club_id = public.current_user_club_id())
            AND (
              NOT EXISTS (SELECT 1 FROM public.announcement_recipients r WHERE r.announcement_id = a.id)
              OR EXISTS (SELECT 1 FROM public.announcement_recipients r WHERE r.announcement_id = a.id AND r.user_id = auth.uid())
            )
          )
          OR (
            NOT EXISTS (SELECT 1 FROM public.announcement_clubs ac WHERE ac.announcement_id = a.id)
            AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.created_by AND p.role = 'super_admin')
            AND (
              a.is_all_clubs
              OR a.audience = 'all'
              OR (a.audience = 'champions' AND public.current_user_role() = 'champion')
              OR (a.audience = 'gatekeepers' AND public.current_user_role() = 'gatekeeper')
            )
          )
        )
    )
  );
$$;

-- The CREATE OR REPLACEs above keep the grants set in step 1.

-- ── 3. Permission data ─────────────────────────────────────────────────────
ALTER VIEW public.v_active_role_delegations SET (security_invoker = true);
REVOKE ALL ON public.v_active_role_delegations FROM anon;

-- ── 4. Audit log: append-only ──────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.audit_logs FROM service_role;

CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit entries can’t be changed.' USING ERRCODE = '42501';
  END IF;
  -- DELETE: trusted server code only (cleans up throwaway test accounts).
  IF coalesce(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Audit entries can’t be deleted.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_logs_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();
