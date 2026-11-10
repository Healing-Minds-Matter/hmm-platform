-- Security go-live Finding 6: deleting resources and their files.
--
-- Before: deleteResourceAction hard-deleted the row and then removed whatever
-- storage path the browser sent, with the service-role key, for any signed-in
-- caller; the "resources bucket: super_admin all" policy also let a browser
-- delete or overwrite files directly.
--
-- After:
--   * Resources are soft-deleted (deleted_at / deleted_by), only by a Super
--     Admin (the existing "resources: super_admin all" policy is the only one
--     allowing UPDATE). A soft-deleted resource is hidden from everyone,
--     including its file (the bucket's read rule looks the resource up).
--     The database writes the audit entry, with the real caller.
--   * No client can hard-delete a resource row.
--   * No client can upload, overwrite or delete files in the resources bucket
--     directly. Uploads go through a one-time signed upload link the server
--     issues (not subject to these rules); replaced files are removed by
--     server code only. Reading is unchanged.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

-- Hidden from every client once deleted (restrictive: ANDed with every read rule).
DROP POLICY IF EXISTS "resources: not deleted" ON public.resources;
CREATE POLICY "resources: not deleted" ON public.resources AS RESTRICTIVE
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- No hard deletes from any client.
DROP POLICY IF EXISTS "resources: no client delete" ON public.resources;
CREATE POLICY "resources: no client delete" ON public.resources AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- Soft delete is one-way for clients, set with the real caller, and audited.
CREATE OR REPLACE FUNCTION public.resources_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NOT public.cert_is_system() THEN
    RAISE EXCEPTION 'This resource has been deleted.' USING ERRCODE = '42501';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF NOT public.cert_is_system() THEN
      NEW.deleted_at := now();
      NEW.deleted_by := auth.uid();
    END IF;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (NEW.deleted_by, 'resource.deleted', 'resource', NEW.id,
            jsonb_build_object('title', NEW.title, 'content_url', NEW.content_url, 'soft_delete', true));
  ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by AND NOT public.cert_is_system() THEN
    NEW.deleted_by := OLD.deleted_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.resources_soft_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resources_soft_delete ON public.resources;
CREATE TRIGGER trg_resources_soft_delete
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.resources_soft_delete();

-- Storage: read-only for clients in the resources bucket.
DROP POLICY IF EXISTS "resources bucket: super_admin all" ON storage.objects;
DROP POLICY IF EXISTS "resources bucket: super_admin read" ON storage.objects;
CREATE POLICY "resources bucket: super_admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resources' AND public.current_user_role() = 'super_admin');
-- ("resources bucket: champion gatekeeper read" is unchanged; it looks the
-- resource up under the caller's rules, so deleted resources' files are hidden.)
