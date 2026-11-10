-- Security go-live Finding 6 (follow-up to 20261112000005).
--
-- A Super Admin's own UPDATE setting deleted_at is refused by Postgres: the
-- updated row must still pass the "resources: not deleted" read rule. So the
-- soft delete goes through one function instead, which checks the caller
-- (active Super Admin) inside the database. The trigger now refuses any
-- other attempt to set deleted_at from a client.

CREATE OR REPLACE FUNCTION public.soft_delete_resource(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done boolean;
BEGIN
  IF NOT public.is_active_user() OR public.current_user_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only Super Admins can delete resources.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('hmm.resource_soft_delete', 'on', true);
  UPDATE public.resources SET deleted_at = now(), deleted_by = auth.uid()
  WHERE id = p_id AND deleted_at IS NULL;
  v_done := FOUND;
  PERFORM set_config('hmm.resource_soft_delete', 'off', true);
  RETURN v_done;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_resource(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_resource(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resources_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_via_function boolean := coalesce(current_setting('hmm.resource_soft_delete', true), '') = 'on';
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NOT public.cert_is_system() THEN
    RAISE EXCEPTION 'This resource has been deleted.' USING ERRCODE = '42501';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    IF NOT public.cert_is_system() AND NOT v_via_function THEN
      RAISE EXCEPTION 'Resources are deleted with soft_delete_resource().' USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
      VALUES (NEW.deleted_by, 'resource.deleted', 'resource', NEW.id,
              jsonb_build_object('title', NEW.title, 'content_url', NEW.content_url, 'soft_delete', true));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.resources_soft_delete() FROM PUBLIC, anon, authenticated;
