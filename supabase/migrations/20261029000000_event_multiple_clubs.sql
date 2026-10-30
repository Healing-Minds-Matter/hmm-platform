-- Events can belong to no club, one club or several clubs.
--
-- The clubs now live in event_clubs (one row per event + club). No rows
-- means the event isn't tied to a club: it's open to all clubs.
--
-- events.club_id is kept, now optional, only so the app version that's
-- live while this migration runs keeps working until the new version is
-- deployed: anything it saves with a club_id is also linked in event_clubs
-- by the trigger below. The new app never writes it (always NULL).
--
-- Champions: may link an event to their own club only (or to none), and
-- may only edit/cancel events they created. Super Admins may link any
-- clubs.

CREATE TABLE public.event_clubs (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  club_id  UUID NOT NULL REFERENCES public.clubs(id),
  PRIMARY KEY (event_id, club_id)
);
CREATE INDEX idx_event_clubs_club_id ON public.event_clubs(club_id);

INSERT INTO public.event_clubs (event_id, club_id)
SELECT id, club_id FROM public.events WHERE club_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.events ALTER COLUMN club_id DROP NOT NULL;

-- Links whatever the previous app version saves in events.club_id.
-- SECURITY DEFINER so it isn't blocked by event_clubs' own policies.
CREATE OR REPLACE FUNCTION public.link_event_legacy_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NOT NULL THEN
    INSERT INTO public.event_clubs (event_id, club_id)
    VALUES (NEW.id, NEW.club_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_link_legacy_club
  AFTER INSERT OR UPDATE OF club_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.link_event_legacy_club();

-- ── events: Champion rules ────────────────────────────────────────────────
DROP POLICY IF EXISTS "events: champion insert" ON public.events;
CREATE POLICY "events: champion insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

-- Was: any Champion of the event's club. Now: only the Champion who created it.
DROP POLICY IF EXISTS "events: champion update club events" ON public.events;
CREATE POLICY "events: champion update own events"
  ON public.events FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

-- ── event_clubs ───────────────────────────────────────────────────────────
ALTER TABLE public.event_clubs ENABLE ROW LEVEL SECURITY;

-- Every signed-in role can read all events (shared calendar), so also
-- which clubs they belong to.
CREATE POLICY "event_clubs: read all"
  ON public.event_clubs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "event_clubs: super_admin insert"
  ON public.event_clubs FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin');

CREATE POLICY "event_clubs: super_admin delete"
  ON public.event_clubs FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "event_clubs: champion insert own club on own events"
  ON public.event_clubs FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND club_id = public.current_user_club_id()
    AND event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid())
  );

CREATE POLICY "event_clubs: champion delete own club on own events"
  ON public.event_clubs FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND club_id = public.current_user_club_id()
    AND event_id IN (SELECT id FROM public.events WHERE created_by = auth.uid())
  );

-- Replaces an event's clubs in one step (one transaction). SECURITY INVOKER:
-- the caller's own event_clubs policies above decide what's allowed.
CREATE OR REPLACE FUNCTION public.set_event_clubs(p_event_id UUID, p_club_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.event_clubs
  WHERE event_id = p_event_id
    AND NOT (club_id = ANY (coalesce(p_club_ids, '{}')));

  INSERT INTO public.event_clubs (event_id, club_id)
  SELECT p_event_id, c FROM unnest(coalesce(p_club_ids, '{}')) AS c
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_event_clubs(UUID, UUID[]) TO authenticated;

-- ── event_registrations: a Champion manages registrations for events
-- linked to their club (was: events.club_id = their club) ────────────────
DROP POLICY IF EXISTS "registrations: champion club events" ON public.event_registrations;
CREATE POLICY "registrations: champion club events"
  ON public.event_registrations FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND event_id IN (
      SELECT event_id FROM public.event_clubs WHERE club_id = public.current_user_club_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND event_id IN (
      SELECT event_id FROM public.event_clubs WHERE club_id = public.current_user_club_id()
    )
  );

-- ── event_details_extra (mobile "Hosted By"): club_name is now every
-- linked club's name, comma-separated, or NULL for an event open to all
-- clubs. Previously an inner join, which would hide events with no club.
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
    (
      SELECT string_agg(c.name, ', ' ORDER BY c.name)
      FROM public.event_clubs ec
      JOIN public.clubs c ON c.id = ec.club_id
      WHERE ec.event_id = e.id
    ),
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
  WHERE e.id = p_event_id;
$$;
