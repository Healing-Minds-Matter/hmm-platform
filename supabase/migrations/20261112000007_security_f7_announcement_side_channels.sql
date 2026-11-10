-- Security go-live Finding 7: announcements a Gatekeeper may not read.
--
-- The announcements table, and therefore realtime, was already correct for
-- Gatekeepers ("announcements: gatekeeper read active": published, within
-- its window, and announcement_reaches_me()). Verified live by
-- supabase/tests/announcement-visibility-rls.mjs. The side routes were not:
--   * announcement_clubs showed the club links of drafts for the reader's club;
--   * announcement_recipients showed your own row even for a draft;
--   * announcement_source_labels() returned labels for drafts, scheduled and
--     expired announcements;
--   * announcement_saves / announcement_reads accepted any announcement id,
--     confirming that a hidden one exists.
--
-- announcement_visible_to_me() mirrors the three read policies on
-- announcements (Super Admin / Champion / Gatekeeper) in one place, and every
-- side route now uses it. Keep it in step with those policies.

CREATE OR REPLACE FUNCTION public.announcement_visible_to_me(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_user() AND EXISTS (
    SELECT 1 FROM public.announcements a
    WHERE a.id = p_announcement_id
      AND (
        public.current_user_role() = 'super_admin'
        OR (
          public.current_user_role() = 'champion'
          AND (
            public.announcement_linked_to_my_club(a.id)
            OR a.created_by = auth.uid()
            OR (a.status = 'published' AND now() >= a.publish_date
                AND (a.expiry_date IS NULL OR now() < a.expiry_date)
                AND public.announcement_reaches_me(a.id))
          )
        )
        OR (
          public.current_user_role() = 'gatekeeper'
          AND a.status = 'published' AND now() >= a.publish_date
          AND (a.expiry_date IS NULL OR now() < a.expiry_date)
          AND public.announcement_reaches_me(a.id)
        )
      )
  )
$$;
REVOKE ALL ON FUNCTION public.announcement_visible_to_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_visible_to_me(uuid) TO authenticated;

-- announcement_clubs: only for announcements you can read.
DROP POLICY IF EXISTS "announcement_clubs: read for announcements that reach me" ON public.announcement_clubs;
DROP POLICY IF EXISTS "announcement_clubs: read for announcements I can see" ON public.announcement_clubs;
CREATE POLICY "announcement_clubs: read for announcements I can see"
  ON public.announcement_clubs FOR SELECT TO authenticated
  USING (public.announcement_visible_to_me(announcement_id));

-- announcement_recipients: your own row, only once you can read the announcement.
DROP POLICY IF EXISTS "announcement_recipients: read own" ON public.announcement_recipients;
CREATE POLICY "announcement_recipients: read own" ON public.announcement_recipients
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.announcement_visible_to_me(announcement_id));

-- Saves / reads: only for announcements you can read (removing your own stays allowed).
DROP POLICY IF EXISTS "announcement_reads: gatekeeper own" ON public.announcement_reads;
CREATE POLICY "announcement_reads: gatekeeper own"
  ON public.announcement_reads FOR ALL TO authenticated
  USING      (gatekeeper_id = auth.uid())
  WITH CHECK (gatekeeper_id = auth.uid() AND public.announcement_visible_to_me(announcement_id));
DROP POLICY IF EXISTS "announcement_saves: gatekeeper own" ON public.announcement_saves;
CREATE POLICY "announcement_saves: gatekeeper own"
  ON public.announcement_saves FOR ALL TO authenticated
  USING      (gatekeeper_id = auth.uid())
  WITH CHECK (gatekeeper_id = auth.uid() AND public.announcement_visible_to_me(announcement_id));

-- Labels only for announcements you can read.
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
    AND public.announcement_visible_to_me(a.id);
$$;
