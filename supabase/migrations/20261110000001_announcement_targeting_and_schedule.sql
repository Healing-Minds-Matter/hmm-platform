-- Announcements: people-level targeting, schedule rules, Champion permissions
-- (sheet rows 38, 61, 71, 72, 73).
--
-- Row 38  "Specific Cohort" can also be narrowed to particular Champions and
--         Gatekeepers inside the chosen clubs (announcement_recipients). With
--         no people chosen, everyone in those clubs receives it, as before.
--         announcement_recipient_count() gives the number of people it will
--         reach, counted once each, before publishing.
--         announcement_reaches_me() now also honours the audience: "Champions"
--         only reaches Champions and "Gatekeepers" only Gatekeepers (before,
--         both reached everyone; the mobile app only filtered on the client).
-- Row 61  Champions use the same form as Super Admins, always for their own
--         club. Creating/editing needs publish_club_announcements and deleting
--         needs delete_announcements (Permissions screen), checked here too.
-- Row 71  A newly set publication time can't be in the past.
-- Row 72  The expiry must be after the publication date/time.
-- Row 73  announcements is added to the realtime publication (if missing) so
--         the mobile app gets live inserts/updates for every announcement.

-- ── Recipients ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, user_id)   -- each person at most once
);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_user ON public.announcement_recipients(user_id);

-- ── Who an announcement reaches ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.announcement_reaches_me(p_announcement_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.current_user_role() = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.announcements a
      WHERE a.id = p_announcement_id
        AND (
          -- Linked to my club; and, when people were picked, I'm one of them.
          (
            EXISTS (SELECT 1 FROM public.announcement_clubs ac
                    WHERE ac.announcement_id = a.id AND ac.club_id = public.current_user_club_id())
            AND (
              NOT EXISTS (SELECT 1 FROM public.announcement_recipients r WHERE r.announcement_id = a.id)
              OR EXISTS (SELECT 1 FROM public.announcement_recipients r WHERE r.announcement_id = a.id AND r.user_id = auth.uid())
            )
          )
          -- Not linked to any club, written by a Super Admin: "All clubs" or
          -- an audience by role.
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
    );
$$;

-- ── Recipient count (before publishing) ─────────────────────────────────────
-- Active Champions and Gatekeepers the announcement would reach, each counted
-- once. A Champion can only count their own club.
CREATE OR REPLACE FUNCTION public.announcement_recipient_count(
  p_audience public.announcement_audience,
  p_is_all_clubs boolean,
  p_club_ids uuid[],
  p_recipient_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role public.user_role := public.current_user_role();
  v_clubs uuid[] := coalesce(p_club_ids, '{}');
  v_people uuid[] := coalesce(p_recipient_ids, '{}');
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'champion') THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'champion' THEN
    p_audience := 'specific_clubs';
    p_is_all_clubs := false;
    v_clubs := ARRAY[public.current_user_club_id()];
  END IF;

  RETURN (
    SELECT count(DISTINCT p.id)::int
    FROM public.profiles p
    LEFT JOIN public.clubs c ON c.id = p.club_id
    WHERE p.is_active
      AND p.role IN ('champion', 'gatekeeper')
      AND CASE
        WHEN p_audience = 'all' THEN true
        WHEN p_audience = 'champions' THEN p.role = 'champion'
        WHEN p_audience = 'gatekeepers' THEN p.role = 'gatekeeper'
        WHEN p_is_all_clubs THEN coalesce(c.is_active, false)
        WHEN cardinality(v_people) > 0 THEN p.club_id = ANY (v_clubs) AND p.id = ANY (v_people)
        ELSE p.club_id = ANY (v_clubs)
      END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.announcement_recipient_count(public.announcement_audience, boolean, uuid[], uuid[]) TO authenticated;

-- ── Expiry after publication (row 72) ───────────────────────────────────────
-- NOT VALID: checked for every new or changed row; older rows are left alone.
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_expiry_after_publish;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_expiry_after_publish
  CHECK (expiry_date IS NULL OR expiry_date > publish_date) NOT VALID;

-- ── Saving (replaces the 11-argument version) ───────────────────────────────
-- p_recipient_ids: people inside the chosen clubs (Specific Cohort only).
-- NULL leaves an existing announcement's people unchanged (older app version).
DROP FUNCTION IF EXISTS public.save_announcement(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.announcement_priority, public.announcement_audience, public.announcement_status, BOOLEAN, BOOLEAN, UUID[]);

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
  p_club_ids UUID[],
  p_recipient_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := coalesce(p_announcement_id, gen_random_uuid());
  v_rows INTEGER;
  v_old_publish TIMESTAMPTZ;
  v_all BOOLEAN := p_audience = 'specific_clubs' AND p_is_all_clubs;
  v_club_ids UUID[] := CASE
    WHEN p_audience = 'specific_clubs' AND NOT p_is_all_clubs THEN coalesce(p_club_ids, '{}')
    ELSE '{}'::UUID[]
  END;
  v_people UUID[] := CASE
    WHEN p_audience = 'specific_clubs' AND NOT p_is_all_clubs THEN p_recipient_ids
    ELSE '{}'::UUID[]
  END;
BEGIN
  IF public.current_user_role() = 'champion' THEN
    IF p_audience <> 'specific_clubs' OR v_all OR v_club_ids <> ARRAY[public.current_user_club_id()] THEN
      RAISE EXCEPTION 'You can only post announcements to your own club.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.cert_can('publish_club_announcements') THEN
      RAISE EXCEPTION 'You don''t have permission to publish announcements.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_audience = 'specific_clubs' AND NOT v_all AND cardinality(v_club_ids) = 0 THEN
    RAISE EXCEPTION 'Please choose at least one club.' USING ERRCODE = '23514';
  END IF;
  IF p_expiry_date IS NOT NULL AND p_expiry_date <= p_publish_date THEN
    RAISE EXCEPTION 'The expiry date and time must be after the publication date and time.' USING ERRCODE = '23514';
  END IF;

  -- Everyone picked must be an active Champion or Gatekeeper in a chosen club.
  IF v_people IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(v_people) AS u(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = u.id AND p.is_active AND p.role IN ('champion', 'gatekeeper') AND p.club_id = ANY (v_club_ids)
    )
  ) THEN
    RAISE EXCEPTION 'Everyone you pick must be an active Champion or Gatekeeper in one of the chosen clubs.' USING ERRCODE = '23514';
  END IF;

  IF p_announcement_id IS NOT NULL THEN
    SELECT publish_date INTO v_old_publish FROM public.announcements WHERE id = p_announcement_id;
  END IF;
  -- A newly set publication time can't be in the past (a few minutes' grace
  -- for "Publish now" and clock differences). An unchanged one is left alone.
  IF p_publish_date IS DISTINCT FROM v_old_publish AND p_publish_date < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'The publication time must be later than now.' USING ERRCODE = '23514';
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

  IF v_people IS NOT NULL THEN
    DELETE FROM public.announcement_recipients
    WHERE announcement_id = v_id AND NOT (user_id = ANY (v_people));
    INSERT INTO public.announcement_recipients (announcement_id, user_id)
    SELECT DISTINCT v_id, u FROM unnest(v_people) AS u
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_announcement(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.announcement_priority, public.announcement_audience, public.announcement_status, BOOLEAN, BOOLEAN, UUID[], UUID[]) TO authenticated;

-- ── announcement_recipients: policies ───────────────────────────────────────
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcement_recipients: super_admin all" ON public.announcement_recipients;
CREATE POLICY "announcement_recipients: super_admin all" ON public.announcement_recipients
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- A Champion manages the people on their own announcements, own club only.
DROP POLICY IF EXISTS "announcement_recipients: champion own" ON public.announcement_recipients;
CREATE POLICY "announcement_recipients: champion own" ON public.announcement_recipients
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND a.created_by = auth.uid())
  )
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id AND a.created_by = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.club_id = public.current_user_club_id())
  );

-- Recipients can see that they were picked.
DROP POLICY IF EXISTS "announcement_recipients: read own" ON public.announcement_recipients;
CREATE POLICY "announcement_recipients: read own" ON public.announcement_recipients
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.announcement_recipients TO authenticated;

-- ── Champion permissions (row 61) ───────────────────────────────────────────
-- Champions may delete the announcements they created by default (decided
-- with the user 2026-11-08). The seed from 20260915070000 had it off, but it
-- was never enforced until now; a Super Admin can still turn it off per role
-- or per person on the Permissions screen. Only their own: the delete policy
-- below also requires created_by = auth.uid().
UPDATE public.permissions SET is_enabled = true
WHERE role = 'champion' AND permission = 'delete_announcements' AND NOT is_enabled;

UPDATE public.permission_catalog
SET description = 'Allows Champions to permanently remove announcements they created themselves.'
WHERE key = 'delete_announcements';

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
SELECT NULL, 'permission.role_default_updated', 'permission', p.id,
       jsonb_build_object('role', 'champion', 'permission', 'delete_announcements', 'new_value', true,
                          'reason', 'Champions delete their own announcements by default (migration 20261110000001)')
FROM public.permissions p WHERE p.role = 'champion' AND p.permission = 'delete_announcements';

DROP POLICY IF EXISTS "announcements: champion insert" ON public.announcements;
CREATE POLICY "announcements: champion insert"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND NOT is_all_clubs
    AND (club_id IS NULL OR club_id = public.current_user_club_id())
    AND public.cert_can('publish_club_announcements')
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
    AND public.cert_can('publish_club_announcements')
  );

DROP POLICY IF EXISTS "announcements: champion delete own" ON public.announcements;
CREATE POLICY "announcements: champion delete own"
  ON public.announcements FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'champion'
    AND created_by = auth.uid()
    AND public.cert_can('delete_announcements')
  );

-- ── Live updates in the mobile app (row 73) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END;
$$;
