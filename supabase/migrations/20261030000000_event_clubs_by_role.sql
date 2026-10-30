-- Which clubs an event is for now depends on who schedules it, and who can
-- see it depends on its clubs. Builds on 20261029000000_event_multiple_clubs
-- (event_clubs), which is already applied.
--
-- An event is EITHER for all clubs (events.is_all_clubs) OR for one or more
-- clubs (event_clubs rows) — never both, never neither.
--
-- Super Admin: any clubs or all clubs; can edit and cancel any event.
-- Champion: only their own club; can edit/cancel an event only if it is for
--   their club alone AND they created it; can never change an event's clubs.
-- Who sees an event: Super Admins see everything. Champions and Gatekeepers
--   see all-club events and events linked to their own club only.

-- ── Data ──────────────────────────────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN is_all_clubs BOOLEAN NOT NULL DEFAULT false;

-- Under the previous migration, an event with no clubs was open to all.
UPDATE public.events e
SET is_all_clubs = true
WHERE NOT EXISTS (SELECT 1 FROM public.event_clubs ec WHERE ec.event_id = e.id);

-- ── Helpers (SECURITY DEFINER so policies can use them without recursion) ──
CREATE OR REPLACE FUNCTION public.user_can_see_event(p_event_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'super_admin'
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.is_all_clubs)
    OR EXISTS (
      SELECT 1 FROM public.event_clubs ec
      WHERE ec.event_id = p_event_id AND ec.club_id = public.current_user_club_id()
    );
$$;

-- A Champion may edit/cancel an event only if they created it and it is for
-- their own club alone.
CREATE OR REPLACE FUNCTION public.champion_can_manage_event(p_event_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'champion'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.created_by = auth.uid() AND NOT e.is_all_clubs
    )
    AND EXISTS (
      SELECT 1 FROM public.event_clubs ec
      WHERE ec.event_id = p_event_id AND ec.club_id = public.current_user_club_id()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.event_clubs ec
      WHERE ec.event_id = p_event_id AND ec.club_id <> public.current_user_club_id()
    );
$$;

-- A Champion may link only their own club, only to an event they created
-- that isn't for all clubs and isn't linked to any other club.
CREATE OR REPLACE FUNCTION public.champion_can_link_event(p_event_id UUID, p_club_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'champion'
    AND p_club_id = public.current_user_club_id()
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.created_by = auth.uid() AND NOT e.is_all_clubs
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.event_clubs ec
      WHERE ec.event_id = p_event_id AND ec.club_id <> p_club_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_see_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champion_can_manage_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champion_can_link_event(UUID, UUID) TO authenticated;

-- ── "All clubs OR at least one club, never both, never neither" ───────────
-- Checked at commit, so an event and its clubs can be saved in one
-- transaction (see save_event below).
CREATE OR REPLACE FUNCTION public.check_event_clubs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_all BOOLEAN;
  v_links INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    v_event_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_event_id := OLD.event_id;
  ELSE
    v_event_id := NEW.event_id;
  END IF;
  SELECT is_all_clubs INTO v_all FROM public.events WHERE id = v_event_id;
  IF NOT FOUND THEN
    RETURN NULL; -- the event itself was deleted
  END IF;
  SELECT count(*) INTO v_links FROM public.event_clubs WHERE event_id = v_event_id;
  IF v_all AND v_links > 0 THEN
    RAISE EXCEPTION 'An event for all clubs cannot also have selected clubs.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_all AND v_links = 0 THEN
    RAISE EXCEPTION 'Please choose at least one club.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_events_check_clubs
  AFTER INSERT OR UPDATE OF is_all_clubs ON public.events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_event_clubs();

CREATE CONSTRAINT TRIGGER trg_event_clubs_check
  AFTER INSERT OR UPDATE OR DELETE ON public.event_clubs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_event_clubs();

-- New links to an inactive club are refused; existing links stay when a
-- club is later deactivated.
CREATE OR REPLACE FUNCTION public.refuse_inactive_club_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_clubs WHERE event_id = NEW.event_id AND club_id = NEW.club_id) THEN
    RETURN NEW; -- already linked (ON CONFLICT DO NOTHING will skip it)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = NEW.club_id AND is_active) THEN
    RAISE EXCEPTION 'Inactive clubs can''t be selected for an event.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_clubs_active_only
  BEFORE INSERT ON public.event_clubs
  FOR EACH ROW EXECUTE FUNCTION public.refuse_inactive_club_link();

-- ── events: policies ──────────────────────────────────────────────────────
-- Read: was "everyone reads all events".
DROP POLICY IF EXISTS "events: champion read all" ON public.events;
DROP POLICY IF EXISTS "events: gatekeeper read all" ON public.events;
CREATE POLICY "events: champion and gatekeeper read for their club"
  ON public.events FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('champion', 'gatekeeper')
    AND public.user_can_see_event(id)
  );

-- Champion insert: never for all clubs; clubs are checked on event_clubs.
DROP POLICY IF EXISTS "events: champion insert" ON public.events;
CREATE POLICY "events: champion insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND NOT is_all_clubs
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

-- Champion update/cancel: only their own events for their club alone.
DROP POLICY IF EXISTS "events: champion update own events" ON public.events;
CREATE POLICY "events: champion update own club-only events"
  ON public.events FOR UPDATE TO authenticated
  USING (public.champion_can_manage_event(id))
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND NOT is_all_clubs
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

-- Super Admin: edit and cancel any event (read + insert already exist).
CREATE POLICY "events: super_admin update"
  ON public.events FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- ── event_clubs: policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "event_clubs: read all" ON public.event_clubs;
CREATE POLICY "event_clubs: read for visible events"
  ON public.event_clubs FOR SELECT TO authenticated
  USING (public.user_can_see_event(event_id));

-- Super Admin insert/delete stay as created in 20261029000000.
DROP POLICY IF EXISTS "event_clubs: champion insert own club on own events" ON public.event_clubs;
CREATE POLICY "event_clubs: champion link own club on own new event"
  ON public.event_clubs FOR INSERT TO authenticated
  WITH CHECK (public.champion_can_link_event(event_id, club_id));

-- Champions can't change an event's clubs, so they never remove a link.
DROP POLICY IF EXISTS "event_clubs: champion delete own club on own events" ON public.event_clubs;

-- ── Saving an event and its clubs together ────────────────────────────────
-- SECURITY INVOKER: the caller's own policies above decide what's allowed.
-- p_event_id NULL creates a new event; otherwise edits that event.
DROP FUNCTION IF EXISTS public.set_event_clubs(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.save_event(
  p_event_id UUID,
  p_title TEXT,
  p_type public.event_type,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_venue TEXT,
  p_description TEXT,
  p_max_participants INTEGER,
  p_facilitator TEXT,
  p_virtual_link TEXT,
  p_is_all_clubs BOOLEAN,
  p_club_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_club_ids UUID[] := CASE WHEN p_is_all_clubs THEN '{}'::UUID[] ELSE coalesce(p_club_ids, '{}') END;
BEGIN
  IF p_event_id IS NULL THEN
    INSERT INTO public.events (
      title, type, starts_at, ends_at, venue, description, max_participants,
      facilitator, virtual_link, is_all_clubs, club_id, created_by
    ) VALUES (
      p_title, p_type, p_starts_at, p_ends_at, p_venue, p_description, p_max_participants,
      p_facilitator, p_virtual_link, p_is_all_clubs, NULL, auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.events SET
      title = p_title, type = p_type, starts_at = p_starts_at, ends_at = p_ends_at,
      venue = p_venue, description = p_description, max_participants = p_max_participants,
      facilitator = p_facilitator, virtual_link = p_virtual_link,
      is_all_clubs = p_is_all_clubs, club_id = NULL, updated_at = now()
    WHERE id = p_event_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Event not found, or you do not have permission to edit it.' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.event_clubs
  WHERE event_id = v_id AND NOT (club_id = ANY (v_club_ids));

  INSERT INTO public.event_clubs (event_id, club_id)
  SELECT v_id, c FROM unnest(v_club_ids) AS c
  ON CONFLICT DO NOTHING;

  -- A Champion has no delete permission on event_clubs: if a link they
  -- asked to remove is still there, refuse instead of silently ignoring it.
  IF EXISTS (
    SELECT 1 FROM public.event_clubs WHERE event_id = v_id AND NOT (club_id = ANY (v_club_ids))
  ) THEN
    RAISE EXCEPTION 'You can''t change this event''s clubs.' USING ERRCODE = '42501';
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_event(UUID, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;

-- ── Registrations ─────────────────────────────────────────────────────────
-- Champion: registrations for events linked to their club, and their own
-- club's Gatekeepers' registrations for all-club events.
DROP POLICY IF EXISTS "registrations: champion club events" ON public.event_registrations;
CREATE POLICY "registrations: champion club events"
  ON public.event_registrations FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND (
      event_id IN (SELECT event_id FROM public.event_clubs WHERE club_id = public.current_user_club_id())
      OR (
        event_id IN (SELECT id FROM public.events WHERE is_all_clubs)
        AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
      )
    )
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND (
      event_id IN (SELECT event_id FROM public.event_clubs WHERE club_id = public.current_user_club_id())
      OR (
        event_id IN (SELECT id FROM public.events WHERE is_all_clubs)
        AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
      )
    )
  );

-- Gatekeeper: own registrations, and only for events they can see.
DROP POLICY IF EXISTS "registrations: gatekeeper own" ON public.event_registrations;
CREATE POLICY "registrations: gatekeeper own"
  ON public.event_registrations FOR ALL TO authenticated
  USING (public.current_user_role() = 'gatekeeper' AND gatekeeper_id = auth.uid())
  WITH CHECK (
    public.current_user_role() = 'gatekeeper'
    AND gatekeeper_id = auth.uid()
    AND public.user_can_see_event(event_id)
  );

-- ── Mobile RPCs: only for events the caller can see ───────────────────────
CREATE OR REPLACE FUNCTION public.event_registration_counts(p_event_ids UUID[])
RETURNS TABLE (event_id UUID, registered_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT er.event_id, count(*) AS registered_count
  FROM public.event_registrations er
  WHERE er.event_id = ANY (p_event_ids)
    AND public.user_can_see_event(er.event_id)
  GROUP BY er.event_id;
$$;

-- club_name: "All clubs", or every linked club's name, comma-separated.
CREATE OR REPLACE FUNCTION public.event_details_extra(p_event_id UUID)
RETURNS TABLE (
  club_name TEXT,
  champion_name TEXT,
  total_registered BIGINT,
  preview_names TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    CASE WHEN e.is_all_clubs THEN 'All clubs' ELSE (
      SELECT string_agg(c.name, ', ' ORDER BY c.name)
      FROM public.event_clubs ec
      JOIN public.clubs c ON c.id = ec.club_id
      WHERE ec.event_id = e.id
    ) END,
    creator.full_name,
    (SELECT count(*) FROM public.event_registrations er WHERE er.event_id = p_event_id),
    (
      SELECT array_agg(names.full_name)
      FROM (
        SELECT pr.full_name
        FROM public.event_registrations er
        JOIN public.profiles pr ON pr.id = er.gatekeeper_id
        WHERE er.event_id = p_event_id
        ORDER BY er.registered_at ASC
        LIMIT 6
      ) names
    )
  FROM public.events e
  LEFT JOIN public.profiles creator ON creator.id = e.created_by
  WHERE e.id = p_event_id
    AND public.user_can_see_event(e.id);
$$;
