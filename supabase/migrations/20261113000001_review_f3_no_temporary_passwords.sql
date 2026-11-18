-- Review Finding 3 (full security review, 10 Nov 2026): temporary passwords
-- never had to be changed, and the creator saw them on screen, so they could
-- sign in as that Gatekeeper at any time.
--
-- New accounts no longer get a temporary password (they choose their own from
-- a single-use set-password link — see 20261113000000). This migration makes
-- the "must change password" rule a database rule for the accounts that still
-- have one:
--   1. While profiles.must_change_password is true, the account can read only
--      its own profile row (and its password history, which the change-
--      password step itself uses). Every other table and file is refused —
--      web and app alike, whatever the client does.
--   2. The flag clears itself when the account's password actually changes
--      (any route: change password, forgot password, set-password link), so
--      no client can clear it, and nobody needs to.
--   3. Existing Champion and Gatekeeper accounts that never replaced their
--      temporary password are flagged now, so they must change it at their
--      next sign-in.

-- ── 1. Refuse data access while a password change is pending ────────────────
CREATE OR REPLACE FUNCTION public.password_change_pending()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT p.must_change_password FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.password_change_pending() FROM PUBLIC, anon;
-- Used inside the access rules, which run as the signed-in user.
GRANT EXECUTE ON FUNCTION public.password_change_pending() TO authenticated, service_role;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND ((n.nspname = 'public' AND c.relname NOT IN ('profiles', 'password_history'))
           OR (n.nspname = 'storage' AND c.relname = 'objects'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "password set first" ON %I.%I', t.schema_name, t.table_name);
    EXECUTE format(
      'CREATE POLICY "password set first" ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (NOT public.password_change_pending()) WITH CHECK (NOT public.password_change_pending())',
      t.schema_name, t.table_name);
  END LOOP;
END $$;

-- Own profile row stays readable (the app and web need the account's name,
-- email and role on the change-password screen); no profile changes until done.
DROP POLICY IF EXISTS "password set first" ON public.profiles;
CREATE POLICY "password set first" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.password_change_pending() OR id = auth.uid())
  WITH CHECK (NOT public.password_change_pending());

-- ── 2. The flag clears when the password really changes ──────────────────────
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.profiles SET must_change_password = false
    WHERE id = NEW.id AND must_change_password;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_users_clear_must_change_password ON auth.users;
CREATE TRIGGER trg_auth_users_clear_must_change_password
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.clear_must_change_password();

-- ── 3. Flag existing accounts still on their temporary password ─────────────
-- Every temporary password was recorded as the account's first password
-- history entry; a password chosen on the web adds another. One entry (or
-- none) means it was never replaced on the web. Passwords changed in the app
-- weren't recorded, so a Gatekeeper who changed theirs there is flagged too
-- and asked to choose a new one once (the safe side).
UPDATE public.profiles p
SET must_change_password = true
WHERE p.role IN ('champion', 'gatekeeper')
  AND NOT p.must_change_password
  AND (SELECT count(*) FROM public.password_history h WHERE h.user_id = p.id) <= 1;
