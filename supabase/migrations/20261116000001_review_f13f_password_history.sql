-- Review Finding 13f: people can no longer change or delete their own
-- password history (which let them get round the "not one of your last 5
-- passwords" rule), and can't read the stored hashes either.
--
-- Before: policy "password_history: own" was FOR ALL TO authenticated on
-- user_id = auth.uid(), so a signed-in user could insert, update and delete
-- their own rows (and read the bcrypt hashes) straight through the API.
--
-- Now:
--   * the policy is gone and every client grant is revoked — RLS stays on, so
--     signed-out and signed-in clients have no access at all;
--   * only trusted server code writes it (lib/password-history.server.ts,
--     using the service role, after the action has checked who is signed in);
--     even the server can't UPDATE a row (history is only added to or pruned);
--   * the one thing the portals show — when the password was last changed, on
--     the Profile page — comes from my_password_changed_at(): the caller's own
--     date only, never a hash.

DROP POLICY IF EXISTS "password_history: own" ON public.password_history;

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_history FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, TRUNCATE ON TABLE public.password_history FROM service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.password_history TO service_role;

CREATE OR REPLACE FUNCTION public.my_password_changed_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(h.created_at)
  FROM public.password_history h
  WHERE h.user_id = auth.uid()
    AND public.is_active_user();
$$;

REVOKE ALL ON FUNCTION public.my_password_changed_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_password_changed_at() TO authenticated;
