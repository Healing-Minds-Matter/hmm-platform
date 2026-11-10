-- Security go-live Finding 1: Champion accounts.
--
-- Who may create a Champion profile is already enforced by RLS:
-- "profiles: super_admin insert" (Super Admins only) and
-- "profiles: champion insert gatekeeper" (Champions: Gatekeepers in their own
-- club only). createChampionAction now writes the profile with the caller's
-- own client, so those policies apply instead of being skipped by the
-- service-role key.
--
-- This adds the missing database check on the club: a Champion can only be
-- created in, or moved into, a club that exists and is active. It runs for
-- every writer, including the service role. Existing Champions in a club
-- that is later deactivated are untouched (only a new or changed club
-- assignment is checked), so the club-deactivation cascade keeps working.

CREATE OR REPLACE FUNCTION public.refuse_champion_inactive_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role <> 'champion' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.club_id IS NOT DISTINCT FROM OLD.club_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;  -- club assignment unchanged
  END IF;

  IF NEW.club_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'A Champion must be assigned to a club.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = NEW.club_id AND is_active) THEN
    RAISE EXCEPTION 'A Champion can only be assigned to an active club.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_champion_inactive_club() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_champion_active_club ON public.profiles;
CREATE TRIGGER trg_profiles_champion_active_club
  BEFORE INSERT OR UPDATE OF club_id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refuse_champion_inactive_club();
