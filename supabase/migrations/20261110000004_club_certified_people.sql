-- "People with a current certification" for the mobile Home tile (sheet rows
-- 59 and 78), counted exactly like the portal (certifiedFigures and
-- certifiedThisMonth in lib/cert-summary.ts):
--   people        active Gatekeepers and Champions in the caller's club
--   certified     of those, people holding at least one current official
--                 certificate that is valid or expiring soon — any type,
--                 each person once
--   certified_this_month
--                 of the certified, people who became certified this month
--                 (Sri Lanka): none of their current valid/expiring
--                 certificates was achieved before the 1st of this month.
-- The platform-wide certification_stats() stays for the current mobile build.
CREATE OR REPLACE FUNCTION public.club_certified_people()
RETURNS TABLE (people bigint, certified bigint, certified_this_month bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH members AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_active
      AND p.role IN ('champion', 'gatekeeper')
      AND p.club_id = public.current_user_club_id()
      AND public.current_user_club_id() IS NOT NULL
  ),
  certified AS (
    SELECT cs.holder_id, min(cs.achieved_on) AS first_achieved
    FROM public.certificate_statuses cs
    JOIN members m ON m.id = cs.holder_id
    WHERE cs.is_current AND cs.removed_at IS NULL AND cs.status IN ('valid', 'expiring_soon')
    GROUP BY cs.holder_id
  )
  SELECT
    (SELECT count(*) FROM members),
    (SELECT count(*) FROM certified),
    (SELECT count(*) FROM certified WHERE first_achieved >= date_trunc('month', public.sl_today())::date);
$$;

REVOKE ALL ON FUNCTION public.club_certified_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_certified_people() TO authenticated;
