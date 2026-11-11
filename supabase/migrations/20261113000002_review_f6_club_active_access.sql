-- Review Finding 6: deactivating a club is one database transaction, and the
-- database itself requires a Champion's or Gatekeeper's club to be active.
--
-- 1. account_is_active(user): active profile AND (Super Admin, or a member of
--    a club that exists and is active). A Champion or Gatekeeper with no club
--    has no access (the app always assigns one; fail closed).
--    is_active_user() — used by the "active users only" restrictive policy on
--    every RLS table and storage.objects, and by the SECURITY DEFINER
--    functions — now uses it, so every one of those checks gets the club
--    check too. current_user_role() / current_user_club_id() return NULL for
--    a member of an inactive club, so role-checking functions refuse them.
--    can_manage_account_sign_in() (Review Finding 2) checks its actor the
--    same way.
-- 2. my_account_status() reports a member of an inactive club as inactive
--    with reason club_deactivated, so the web and app say "Your club is
--    currently inactive" (older app builds already map that reason).
-- 3. set_club_active(club, active): the only way to change a club's status.
--    Active Super Admins only; one transaction:
--      deactivate → club off, every active member deactivated (reason
--      club_deactivated; the existing trigger ends their sessions), their
--      open delegations ended, audit entries written;
--      reactivate → club on, members deactivated by this club's cascade
--      restored, audit entry written.
--    Nothing is written (or audited) when the status is already as asked.
--    The audit entries record the real caller (auth.uid()).
-- 4. A trigger refuses any other change to clubs.is_active (a client update,
--    a partial cascade) — except the server/system (service role / no
--    caller) for maintenance.

-- ── 1. One definition of "has access" ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.account_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT p.is_active
       AND (p.role = 'super_admin' OR coalesce(c.is_active, false))
    FROM public.profiles p
    LEFT JOIN public.clubs c ON c.id = p.club_id
    WHERE p.id = p_user_id
  ), false)
$$;
REVOKE ALL ON FUNCTION public.account_is_active(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_active(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.account_is_active(auth.uid())
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
  SELECT role FROM public.profiles WHERE id = auth.uid() AND public.account_is_active(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_user_club_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.profiles WHERE id = auth.uid() AND public.account_is_active(auth.uid())
$$;

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
      AND public.account_is_active(a.id)
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

-- ── 2. Own status: an inactive club counts as inactive ─────────────────────
CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS TABLE (role public.user_role, is_active boolean, deactivation_reason public.deactivation_reason, must_change_password boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.role,
    public.account_is_active(p.id),
    CASE
      WHEN p.is_active AND p.role <> 'super_admin' AND c.id IS NOT NULL AND NOT c.is_active
        THEN 'club_deactivated'::public.deactivation_reason
      ELSE p.deactivation_reason
    END,
    p.must_change_password
  FROM public.profiles p
  LEFT JOIN public.clubs c ON c.id = p.club_id
  WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_status() TO authenticated;

-- ── 3. The one way to change a club's status ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_club_active(p_club_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_current boolean;
  v_members jsonb;
  v_ids     uuid[];
  v_member  uuid;
  v_ended   jsonb;
BEGIN
  IF NOT public.is_active_user() OR public.current_user_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only Super Admins can change a club''s status.' USING ERRCODE = '42501';
  END IF;
  IF p_club_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'Club and status are required.' USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_current FROM public.clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_current = p_active THEN
    RETURN jsonb_build_object('changed', false, 'users', '[]'::jsonb);
  END IF;

  PERFORM set_config('hmm.club_status_change', 'on', true);
  UPDATE public.clubs SET is_active = p_active WHERE id = p_club_id;
  PERFORM set_config('hmm.club_status_change', 'off', true);

  IF NOT p_active THEN
    -- Every active member; the profiles trigger ends each one's sessions.
    WITH changed AS (
      UPDATE public.profiles
      SET is_active = false, deactivation_reason = 'club_deactivated', deactivated_club_id = p_club_id
      WHERE club_id = p_club_id AND is_active
      RETURNING id, role, full_name
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'role', role, 'name', full_name)), '[]'::jsonb),
           coalesce(array_agg(id), '{}')
      INTO v_members, v_ids
      FROM changed;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'club.deactivated', 'club', p_club_id, jsonb_build_object('affectedUsers', v_members));

    -- Delegations a deactivated member had given end now (as for a manual
    -- deactivation), each with its own audit entry.
    FOREACH v_member IN ARRAY v_ids LOOP
      WITH ended AS (
        UPDATE public.role_delegations
        SET ended_early_at = now(), ended_reason = 'delegator_deactivated'
        WHERE delegator_id = v_member AND ended_early_at IS NULL AND ends_at > now()
        RETURNING id, delegate_id
      )
      SELECT CASE WHEN count(*) = 0 THEN NULL
                  ELSE jsonb_build_object('ended_delegation_ids', jsonb_agg(id), 'delegate_ids', jsonb_agg(delegate_id)) END
        INTO v_ended
        FROM ended;
      IF v_ended IS NOT NULL THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_actor, 'role_delegation.ended_delegator_deactivated', 'profile', v_member, v_ended);
      END IF;
    END LOOP;

    RETURN jsonb_build_object('changed', true, 'users', v_members);
  END IF;

  -- Reactivate: restore only members this club's cascade deactivated.
  WITH changed AS (
    UPDATE public.profiles
    SET is_active = true, deactivation_reason = NULL, deactivated_club_id = NULL
    WHERE deactivated_club_id = p_club_id AND deactivation_reason = 'club_deactivated'
    RETURNING id, role, full_name
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'role', role, 'name', full_name)), '[]'::jsonb)
    INTO v_members
    FROM changed;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'club.reactivated', 'club', p_club_id, jsonb_build_object('restoredUsers', v_members));

  RETURN jsonb_build_object('changed', true, 'users', v_members);
END;
$$;
REVOKE ALL ON FUNCTION public.set_club_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_club_active(uuid, boolean) TO authenticated;

-- ── 4. No other route changes a club's status ──────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_club_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND coalesce(current_setting('hmm.club_status_change', true), '') <> 'on'
     AND NOT public.cert_is_system() THEN
    RAISE EXCEPTION 'A club''s status is changed with set_club_active().' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_club_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clubs_guard_status_change ON public.clubs;
CREATE TRIGGER trg_clubs_guard_status_change
  BEFORE UPDATE OF is_active ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.guard_club_status_change();
