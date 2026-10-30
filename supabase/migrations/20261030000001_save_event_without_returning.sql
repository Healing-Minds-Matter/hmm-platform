-- Fix for 20261030000000: a Champion couldn't create an event.
--
-- save_event used INSERT ... RETURNING id. RETURNING is checked against the
-- caller's SELECT policy, and a Champion can only see an event once it's
-- linked to their club — which happens a moment later in the same function.
-- So the insert was refused for every Champion. The id is now generated up
-- front and the row count read with GET DIAGNOSTICS instead of RETURNING.
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
  v_id UUID := coalesce(p_event_id, gen_random_uuid());
  v_rows INTEGER;
  v_club_ids UUID[] := CASE WHEN p_is_all_clubs THEN '{}'::UUID[] ELSE coalesce(p_club_ids, '{}') END;
BEGIN
  IF p_event_id IS NULL THEN
    INSERT INTO public.events (
      id, title, type, starts_at, ends_at, venue, description, max_participants,
      facilitator, virtual_link, is_all_clubs, club_id, created_by
    ) VALUES (
      v_id, p_title, p_type, p_starts_at, p_ends_at, p_venue, p_description, p_max_participants,
      p_facilitator, p_virtual_link, p_is_all_clubs, NULL, auth.uid()
    );
  ELSE
    UPDATE public.events SET
      title = p_title, type = p_type, starts_at = p_starts_at, ends_at = p_ends_at,
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
