-- Events (sheet rows 43, 57, 66).
--
-- Row 43  An "Other" event needs a short description of its type
--         (events.type_description), shown wherever the type is shown.
-- Row 57  Champions can see (read-only) the events of every club, so the club
--         filter on their calendar can list all clubs. Editing is unchanged:
--         only their own events for their own club (champion_can_manage_event).
--         Gatekeepers are unchanged.
-- Row 66  event_registrants(): who registered for an event — name, club and
--         registration time. Super Admins see everyone; Champions only people
--         from their own club. The Champion policy on event_registrations is
--         narrowed to their own club's people to match.

-- ── Row 43 ──────────────────────────────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS type_description text
  CHECK (type_description IS NULL OR length(btrim(type_description)) BETWEEN 1 AND 120);

-- NOT VALID: checked for every new or changed event; older "Other" events
-- without a description are left alone until they are next edited.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_other_needs_description;
ALTER TABLE public.events
  ADD CONSTRAINT events_other_needs_description
  CHECK (type <> 'other' OR (type_description IS NOT NULL AND btrim(type_description) <> '')) NOT VALID;

-- save_event gains p_type_description (kept only for "Other"). DEFAULT NULL so
-- the version of the app live while this runs keeps working for other types.
DROP FUNCTION IF EXISTS public.save_event(UUID, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN, UUID[]);

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
  p_club_ids UUID[],
  p_type_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := coalesce(p_event_id, gen_random_uuid());
  v_rows INTEGER;
  v_club_ids UUID[] := CASE WHEN p_is_all_clubs THEN '{}'::UUID[] ELSE coalesce(p_club_ids, '{}') END;
  v_type_description TEXT := CASE WHEN p_type = 'other' THEN nullif(btrim(p_type_description), '') ELSE NULL END;
BEGIN
  IF p_type = 'other' AND v_type_description IS NULL THEN
    RAISE EXCEPTION 'Describe the event type.' USING ERRCODE = '23514';
  END IF;

  IF p_event_id IS NULL THEN
    INSERT INTO public.events (
      id, title, type, type_description, starts_at, ends_at, venue, description, max_participants,
      facilitator, virtual_link, is_all_clubs, club_id, created_by
    ) VALUES (
      v_id, p_title, p_type, v_type_description, p_starts_at, p_ends_at, p_venue, p_description, p_max_participants,
      p_facilitator, p_virtual_link, p_is_all_clubs, NULL, auth.uid()
    );
  ELSE
    UPDATE public.events SET
      title = p_title, type = p_type, type_description = v_type_description, starts_at = p_starts_at, ends_at = p_ends_at,
      venue = p_venue, description = p_description, max_participants = p_max_participants,
      facilitator = p_facilitator, virtual_link = p_virtual_link,
      is_all_clubs = p_is_all_clubs, club_id = NULL, updated_at = now()
    WHERE id = p_event_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Event not found, or you do not have permission to edit it.' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.event_clubs
  WHERE event_id = v_id AND NOT (club_id = ANY (v_club_ids));

  INSERT INTO public.event_clubs (event_id, club_id)
  SELECT v_id, c FROM unnest(v_club_ids) AS c
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.event_clubs WHERE event_id = v_id AND NOT (club_id = ANY (v_club_ids))
  ) THEN
    RAISE EXCEPTION 'You can''t change this event''s clubs.' USING ERRCODE = '42501';
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_event(UUID, TEXT, public.event_type, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, TEXT, TEXT, BOOLEAN, UUID[], TEXT) TO authenticated;

-- ── Row 57 ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events: champion read all clubs" ON public.events;
CREATE POLICY "events: champion read all clubs"
  ON public.events FOR SELECT TO authenticated
  USING (public.current_user_role() = 'champion');

DROP POLICY IF EXISTS "event_clubs: champion read all" ON public.event_clubs;
CREATE POLICY "event_clubs: champion read all"
  ON public.event_clubs FOR SELECT TO authenticated
  USING (public.current_user_role() = 'champion');

-- ── Row 66 ──────────────────────────────────────────────────────────────────
-- A Champion's access to registrations: their own club's people only.
DROP POLICY IF EXISTS "registrations: champion club events" ON public.event_registrations;
CREATE POLICY "registrations: champion club events"
  ON public.event_registrations FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND gatekeeper_id IN (SELECT id FROM public.profiles WHERE club_id = public.current_user_club_id())
    AND public.user_can_see_event(event_id)
  );

CREATE OR REPLACE FUNCTION public.event_registrants(p_event_id UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, role public.user_role, club_name TEXT, registered_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_role public.user_role := public.current_user_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'champion') THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.role, c.name, er.registered_at
  FROM public.event_registrations er
  JOIN public.profiles p ON p.id = er.gatekeeper_id
  LEFT JOIN public.clubs c ON c.id = p.club_id
  WHERE er.event_id = p_event_id
    AND (v_role = 'super_admin' OR p.club_id = public.current_user_club_id())
  ORDER BY er.registered_at ASC, p.full_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.event_registrants(UUID) TO authenticated;
