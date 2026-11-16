-- Review Finding 13g: event details no longer show the names of people
-- registered from other clubs.
--
-- event_details_extra() (SECURITY DEFINER, used by the Gatekeeper app's
-- event screen) returned preview_names — the first 6 registrants of ANY
-- club — to anyone who could see the event, so a Gatekeeper saw (as
-- initials) people from other clubs on an all-clubs event.
--
-- Decided rules, enforced here in the database:
--   Super Admin — names of all registrants;
--   Champion    — names of their own club's registrants only;
--   Gatekeeper  — no names: the registrant count only (total_registered).
-- Same columns as before, so app builds already installed keep working
-- (they simply show no initials). The web portals use event_registrants(),
-- which already applies the Super Admin / own-club rule; the
-- event_registrations table rules are unchanged (Gatekeepers read only their
-- own registrations).

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
  WITH me AS (
    SELECT public.current_user_role() AS role, public.current_user_club_id() AS club_id
  )
  SELECT
    CASE WHEN e.is_all_clubs THEN 'All clubs' ELSE (
      SELECT string_agg(c.name, ', ' ORDER BY c.name)
      FROM public.event_clubs ec
      JOIN public.clubs c ON c.id = ec.club_id
      WHERE ec.event_id = e.id
    ) END,
    creator.full_name,
    (SELECT count(*) FROM public.event_registrations er WHERE er.event_id = p_event_id),
    CASE WHEN me.role IN ('super_admin', 'champion') THEN (
      SELECT array_agg(names.full_name)
      FROM (
        SELECT pr.full_name
        FROM public.event_registrations er
        JOIN public.profiles pr ON pr.id = er.gatekeeper_id
        WHERE er.event_id = p_event_id
          AND (me.role = 'super_admin' OR pr.club_id = me.club_id)
        ORDER BY er.registered_at ASC
        LIMIT 6
      ) names
    ) END
  FROM public.events e
  CROSS JOIN me
  LEFT JOIN public.profiles creator ON creator.id = e.created_by
  WHERE e.id = p_event_id
    AND public.user_can_see_event(e.id);
$$;

-- Unchanged from Security Finding 5: signed-in users only.
REVOKE ALL ON FUNCTION public.event_details_extra(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_details_extra(UUID) TO authenticated;
