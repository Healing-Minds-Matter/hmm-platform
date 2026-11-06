-- Remove hard-coded QPR from labels and figures (decided with the user 2026-11-06).
--
-- Every change here keeps the live site (main) and the current mobile build
-- working, because they share this database:
--   * Stored values the live code matches on are NOT renamed: the event type
--     enum value 'qpr_session', the permission key 'schedule_qpr_sessions' and
--     the permission category text. New code shows display labels for them.
--   * Only display text is changed (permission labels/descriptions, one
--     resource category), which the live code just prints.
--   * qpr_certification_stats() is kept for the current mobile build; the new
--     certification_stats() counts every type and replaces it in new builds.

-- 1. Permission labels and descriptions (display text only; keys unchanged).
UPDATE public.permission_catalog
SET label = 'Schedule Certification Programme Sessions',
    description = 'Allows creating in-person and virtual certification programme sessions.'
WHERE key = 'schedule_qpr_sessions';

UPDATE public.permission_catalog
SET description = 'Allows self-registration for scheduled certification programme sessions.'
WHERE key = 'register_for_training';

-- 2. Resource category: "QPR Training" becomes "Certification Training"
--    (lib/resource-categories.ts changes to match).
UPDATE public.resources
SET category = 'Certification Training'
WHERE category = 'QPR Training';

-- 3. Platform-wide certification figures for the mobile Home card, across
--    every certification type. A person counts once however many they hold.
--    certified: active Champions and Gatekeepers holding at least one current
--      certificate that is valid or expiring soon (status rules of Story 10.0).
--    certified_this_month: of those, people with such a certificate achieved
--      this calendar month (Sri Lanka time).
CREATE OR REPLACE FUNCTION public.certification_stats()
RETURNS TABLE (total_certified BIGINT, certified_this_month BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    count(DISTINCT cs.holder_id) AS total_certified,
    count(DISTINCT cs.holder_id) FILTER (
      WHERE cs.achieved_on >= date_trunc('month', public.sl_today())::date
    ) AS certified_this_month
  FROM public.certificate_statuses cs
  JOIN public.profiles p ON p.id = cs.holder_id
  WHERE cs.is_current
    AND cs.removed_at IS NULL
    AND cs.status IN ('valid', 'expiring_soon')
    AND p.is_active
    AND p.role IN ('champion', 'gatekeeper');
$$;

REVOKE ALL ON FUNCTION public.certification_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.certification_stats() TO authenticated;
