-- Security go-live Finding 4: attendance and event registration.
--
-- Before: "registrations: gatekeeper own" and "registrations: champion club
-- events" were FOR ALL policies, so a Gatekeeper could mark their own
-- attendance (UPDATE, or INSERT with attended = true), move or delete
-- registrations, and register for cancelled or past events; a Champion could
-- insert and delete registrations. Super Admins could only read.
--
-- After:
--   * Gatekeeper: read own registrations; register themselves only for an
--     event that is not cancelled, hasn't started, and is open to their club
--     (own club, selected clubs including theirs, or all clubs). Never twice
--     (existing UNIQUE). Can't update or delete.
--   * Attendance (`attended`) can only be set by a Super Admin, or by a
--     Champion for their own club's Gatekeepers on events open to their club.
--     Nothing else on a registration can be changed by anyone but the server.
--   * Nobody deletes registrations from a client: cancelled events keep their
--     registrations as history.
--   * Every attendance change is written to audit_logs by the database, with
--     the real caller.
--   (The "active users only" policy from Finding 2 also applies.)
-- Events have no draft/published status: any event that exists and isn't
-- cancelled is published.

-- ── Registration rules (one place, used by the policy and the trigger) ──────
CREATE OR REPLACE FUNCTION public.event_registration_refusal(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events;
BEGIN
  IF NOT public.is_active_user() OR public.current_user_role() IS DISTINCT FROM 'gatekeeper' THEN
    RETURN 'Only Gatekeepers can register for events.';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL OR NOT public.user_can_see_event(p_event_id) THEN
    RETURN 'This event isn’t open to your club.';
  END IF;
  IF v_event.is_cancelled THEN
    RETURN 'This event has been cancelled.';
  END IF;
  IF v_event.starts_at <= now() THEN
    RETURN 'Registration has closed: this event has already started.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.event_registration_refusal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_registration_refusal(uuid) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "registrations: gatekeeper own" ON public.event_registrations;
DROP POLICY IF EXISTS "registrations: gatekeeper read own" ON public.event_registrations;
DROP POLICY IF EXISTS "registrations: gatekeeper register" ON public.event_registrations;
CREATE POLICY "registrations: gatekeeper read own"
  ON public.event_registrations FOR SELECT TO authenticated
  USING (public.current_user_role() = 'gatekeeper' AND gatekeeper_id = auth.uid());
CREATE POLICY "registrations: gatekeeper register"
  ON public.event_registrations FOR INSERT TO authenticated
  WITH CHECK (
    gatekeeper_id = auth.uid()
    AND attended IS NULL
    AND public.event_registration_refusal(event_id) IS NULL
  );

-- Champion: read their own club's people's registrations (sheet row 66, as
-- before); update (attendance only, see trigger) for events open to their club.
DROP POLICY IF EXISTS "registrations: champion club events" ON public.event_registrations;
DROP POLICY IF EXISTS "registrations: champion read club" ON public.event_registrations;
DROP POLICY IF EXISTS "registrations: champion mark attendance" ON public.event_registrations;
CREATE POLICY "registrations: champion read club"
  ON public.event_registrations FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
  );
CREATE POLICY "registrations: champion mark attendance"
  ON public.event_registrations FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
    AND public.user_can_see_event(event_id)
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
    AND public.user_can_see_event(event_id)
  );

-- Super Admin: read (unchanged) and mark attendance.
DROP POLICY IF EXISTS "registrations: super_admin mark attendance" ON public.event_registrations;
CREATE POLICY "registrations: super_admin mark attendance"
  ON public.event_registrations FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- ── Trigger: clear messages, attendance-only updates, audit ────────────────
CREATE OR REPLACE FUNCTION public.guard_event_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal text;
BEGIN
  IF public.cert_is_system() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.gatekeeper_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You can only register yourself.' USING ERRCODE = '42501';
    END IF;
    v_refusal := public.event_registration_refusal(NEW.event_id);
    IF v_refusal IS NOT NULL THEN
      RAISE EXCEPTION '%', v_refusal USING ERRCODE = '42501';
    END IF;
    NEW.attended := NULL;          -- attendance is never self-reported
    NEW.registered_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE: only attendance, only by a Super Admin or the Gatekeeper's Champion (policies).
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.gatekeeper_id IS DISTINCT FROM OLD.gatekeeper_id OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'Only attendance can be changed on a registration.' USING ERRCODE = '42501';
  END IF;
  IF public.current_user_role() IS DISTINCT FROM 'super_admin' AND public.current_user_role() IS DISTINCT FROM 'champion' THEN
    RAISE EXCEPTION 'Only a Champion or Super Admin can mark attendance.' USING ERRCODE = '42501';
  END IF;
  IF NEW.attended IS DISTINCT FROM OLD.attended THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'event.attendance_marked', 'event', NEW.event_id,
            jsonb_build_object('registration_id', NEW.id, 'gatekeeper_id', NEW.gatekeeper_id, 'from', OLD.attended, 'to', NEW.attended));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_event_registration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_event_registrations_guard ON public.event_registrations;
CREATE TRIGGER trg_event_registrations_guard
  BEFORE INSERT OR UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_registration();
