-- Decision 6 (after Security Finding 5): the audit log is permanent.
--
-- Finding 5 made it append-only for clients and kept DELETE for trusted
-- server code (used only to clean up throwaway test accounts). Now nobody
-- can change, delete or truncate an entry — clients, the server
-- (service role) or a database admin running SQL. Test scripts deactivate
-- and ban their throwaway users instead of deleting them
-- (supabase/tests/_rls-helpers.mjs: retireUsers).
--
-- Because audit_logs.actor_id references profiles, a user who appears in the
-- log can no longer be hard-deleted either — which matches the rule that
-- user data is never hard-deleted (people are deactivated).

CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit entries can’t be changed.' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Audit entries can’t be deleted.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.audit_logs_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

-- TRUNCATE skips row triggers, so refuse it with a statement trigger too.
CREATE OR REPLACE FUNCTION public.audit_logs_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'The audit log can’t be emptied.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.audit_logs_no_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_no_truncate();

REVOKE TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated, service_role;
