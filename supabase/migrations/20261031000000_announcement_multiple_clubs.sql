-- Announcements for several clubs, or for all clubs.
--
-- Audience "Specific Cohort" used to mean exactly one club (announcements.
-- club_id). Now a Super Admin picks "All clubs" (is_all_clubs) or one or
-- more clubs (announcement_clubs rows). A Champion's announcement is
-- always for their own club only.
--
-- Who sees an announcement (Champions and Gatekeepers):
--   * linked to their club, or
--   * not linked to any club AND written by a Super Admin — every other
--     audience (All Users / Champions / Gatekeepers) and "All clubs".
--   Champions and Gatekeepers only see published, active ones — except a
--   Champion still sees every announcement linked to their club, to manage
--   their own posts (as before).
--
-- announcements.club_id is kept, now unused by the new app, only so the
-- version live while this migration runs keeps working: whatever it saves
-- there is also linked by the trigger below.

ALTER TABLE public.announcements ADD COLUMN is_all_clubs BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.announcement_clubs (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  club_id         UUID NOT NULL REFERENCES public.clubs(id),
  PRIMARY KEY (announcement_id, club_id)
);
CREATE INDEX idx_announcement_clubs_club_id ON public.announcement_clubs(club_id);

INSERT INTO public.announcement_clubs (announcement_id, club_id)
SELECT id, club_id FROM public.announcements WHERE club_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.link_announcement_legacy_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NOT NULL THEN
    INSERT INTO public.announcement_clubs (announcement_id, club_id)
    VALUES (NEW.id, NEW.club_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_announcements_link_legacy_club
  AFTER INSERT OR UPDATE OF club_id ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.link_announcement_legacy_club();

-- ── Helpers (SECURITY DEFINER: usable in policies without recursion) ──────
-- Is this announcement for the caller's club? (Not about dates/status.)
CREATE OR REPLACE FUNCTION public.announcement_reaches_me(p_announcement_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.announcement_clubs ac
      WHERE ac.announcement_id = p_announcement_id AND ac.club_id = public.current_user_club_id()
    )
    OR (
      NOT EXISTS (SELECT 1 FROM public.announcement_clubs ac WHERE ac.announcement_id = p_announcement_id)
      AND EXISTS (
        SELECT 1 FROM public.announcements a
        JOIN public.profiles p ON p.id = a.created_by
        WHERE a.id = p_announcement_id AND p.role = 'super_admin'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.announcement_linked_to_my_club(p_announcement_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.announcement_clubs ac
    WHERE ac.announcement_id = p_announcement_id AND ac.club_id = public.current_user_club_id()
  );
$$;

-- A Champion may link only their own club, only to their own announcement.
CREATE OR REPLACE FUNCTION public.champion_can_link_announcement(p_announcement_id UUID, p_club_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'champion'
    AND p_club_id = public.current_user_club_id()
    AND EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = p_announcement_id AND a.created_by = auth.uid() AND NOT a.is_all_clubs
    );
$$;

GRANT EXECUTE ON FUNCTION public.announcement_reaches_me(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_linked_to_my_club(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champion_can_link_announcement(UUID, UUID) TO authenticated;

-- ── announcements: policies (Super Admin "all" policy is unchanged) ───────
DROP POLICY IF EXISTS "announcements: champion read" ON public.announcements;
CREATE POLICY "announcements: champion read"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND (
      -- Everything for their own club (to manage their own posts), as before.
      public.announcement_linked_to_my_club(id)
      OR created_by = auth.uid()
      -- Otherwise only published, active announcements meant for them.
      OR (
        status = 'published'
        AND NOW() >= publish_date
        AND (expiry_date IS NULL OR NOW() < expiry_date)
        AND public.announcement_reaches_me(id)
      )
    )
  );

DROP POLICY IF EXISTS "announcements: champion insert" ON public.announcements;
CREATE POLICY "announcements: champion insert"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND NOT is_all_clubs
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

DROP POLICY IF EXISTS "announcements: champion update own" ON public.announcements;
CREATE POLICY "announcements: champion update own"
  ON public.announcements FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'champion' AND created_by = auth.uid())
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND NOT is_all_clubs
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
  );

-- Gatekeeper: published, active, and for their club or everyone. (Before,
-- status wasn't checked, so drafts with active dates were readable.)
DROP POLICY IF EXISTS "announcements: gatekeeper read active" ON public.announcements;
CREATE POLICY "announcements: gatekeeper read active"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'gatekeeper'
    AND status = 'published'
    AND NOW() >= publish_date
    AND (expiry_date IS NULL OR NOW() < expiry_date)
    AND public.announcement_reaches_me(id)
  );

-- ── announcement_clubs: policies ──────────────────────────────────────────
ALTER TABLE public.announcement_clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_clubs: read for announcements that reach me"
  ON public.announcement_clubs FOR SELECT TO authenticated
  USING (public.announcement_reaches_me(announcement_id));

CREATE POLICY "announcement_clubs: super_admin insert"
  ON public.announcement_clubs FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin');

CREATE POLICY "announcement_clubs: super_admin delete"
  ON public.announcement_clubs FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "announcement_clubs: champion link own club"
  ON public.announcement_clubs FOR INSERT TO authenticated
  WITH CHECK (public.champion_can_link_announcement(announcement_id, club_id));

-- ── Saving an announcement and its clubs together ─────────────────────────
-- SECURITY INVOKER: the caller's own policies decide what's allowed. The id
-- is generated up front (no INSERT ... RETURNING, which would be checked
-- against the caller's read policy before the club link exists).
CREATE OR REPLACE FUNCTION public.save_announcement(
  p_announcement_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_publish_date TIMESTAMPTZ,
  p_expiry_date TIMESTAMPTZ,
  p_priority public.announcement_priority,
  p_audience public.announcement_audience,
  p_status public.announcement_status,
  p_is_pinned BOOLEAN,
  p_is_all_clubs BOOLEAN,
  p_club_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := coalesce(p_announcement_id, gen_random_uuid());
  v_rows INTEGER;
  v_all BOOLEAN := p_audience = 'specific_clubs' AND p_is_all_clubs;
  v_club_ids UUID[] := CASE
    WHEN p_audience = 'specific_clubs' AND NOT p_is_all_clubs THEN coalesce(p_club_ids, '{}')
    ELSE '{}'::UUID[]
  END;
BEGIN
  IF public.current_user_role() = 'champion' THEN
    IF p_audience <> 'specific_clubs' OR v_all OR v_club_ids <> ARRAY[public.current_user_club_id()] THEN
      RAISE EXCEPTION 'You can only post announcements to your own club.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_audience = 'specific_clubs' AND NOT v_all AND cardinality(v_club_ids) = 0 THEN
    RAISE EXCEPTION 'Please choose at least one club.' USING ERRCODE = '23514';
  END IF;

  IF p_announcement_id IS NULL THEN
    INSERT INTO public.announcements (
      id, title, body, publish_date, expiry_date, priority, audience, status,
      is_pinned, is_all_clubs, club_id, created_by
    ) VALUES (
      v_id, p_title, p_body, p_publish_date, p_expiry_date, p_priority, p_audience, p_status,
      p_is_pinned, v_all, NULL, auth.uid()
    );
  ELSE
    UPDATE public.announcements SET
      title = p_title, body = p_body, publish_date = p_publish_date, expiry_date = p_expiry_date,
      priority = p_priority, audience = p_audience, status = p_status, is_pinned = p_is_pinned,
      is_all_clubs = v_all, club_id = NULL
    WHERE id = p_announcement_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Announcement not found, or you do not have permission to edit it.' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.announcement_clubs
  WHERE announcement_id = v_id AND NOT (club_id = ANY (v_club_ids));

  INSERT INTO public.announcement_clubs (announcement_id, club_id)
  SELECT v_id, c FROM unnest(v_club_ids) AS c
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_announcement(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.announcement_priority, public.announcement_audience, public.announcement_status, BOOLEAN, BOOLEAN, UUID[]) TO authenticated;

-- ── Mobile "SUPER ADMIN" / "{club} CHAMPION" label: a Champion's club now
-- comes from their profile, since announcements.club_id is no longer set.
CREATE OR REPLACE FUNCTION public.announcement_source_labels(p_announcement_ids UUID[])
RETURNS TABLE (announcement_id UUID, source_label TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.id,
    CASE
      WHEN creator.role = 'super_admin' THEN 'SUPER ADMIN'
      WHEN creator.role = 'champion' THEN UPPER(COALESCE(c.name, 'Club') || ' CHAMPION')
      ELSE UPPER(creator.role::text)
    END
  FROM public.announcements a
  JOIN public.profiles creator ON creator.id = a.created_by
  LEFT JOIN public.clubs c ON c.id = coalesce(a.club_id, creator.club_id)
  WHERE a.id = ANY (p_announcement_ids)
    AND public.announcement_reaches_me(a.id);
$$;
