-- Follow-up to Security Finding 6 (your decision 3): announcements and
-- resource categories are soft-deleted too, like resources.
--
-- Same pattern as soft_delete_resource():
--   * deleted_at / deleted_by columns; a deleted row is hidden from every
--     client (restrictive read policy) and no client can hard-delete;
--   * one function per delete re-checks the caller inside the database,
--     records the real caller, and writes the audit entry;
--   * deleted_at can't be set or cleared any other way by a client.

-- ── Announcements ───────────────────────────────────────────────────────────
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

DROP POLICY IF EXISTS "announcements: not deleted" ON public.announcements;
CREATE POLICY "announcements: not deleted" ON public.announcements AS RESTRICTIVE
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
DROP POLICY IF EXISTS "announcements: no client delete" ON public.announcements;
CREATE POLICY "announcements: no client delete" ON public.announcements AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- Who may delete: a Super Admin (any), or a Champion their own announcement
-- with the delete_announcements permission (as the old delete policy).
CREATE OR REPLACE FUNCTION public.soft_delete_announcement(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ann public.announcements;
BEGIN
  SELECT * INTO v_ann FROM public.announcements WHERE id = p_id AND deleted_at IS NULL;
  IF v_ann.id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_active_user() OR NOT (
       public.current_user_role() = 'super_admin'
       OR (public.current_user_role() = 'champion' AND v_ann.created_by = auth.uid() AND public.cert_can('delete_announcements'))
     ) THEN
    RAISE EXCEPTION 'You don’t have permission to delete this announcement.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('hmm.soft_delete', 'on', true);
  UPDATE public.announcements SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_id;
  PERFORM set_config('hmm.soft_delete', 'off', true);
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'announcement.deleted', 'announcement', p_id, jsonb_build_object('title', v_ann.title, 'soft_delete', true));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_announcement(uuid) TO authenticated;

-- Side routes (Finding 7) must treat a deleted announcement as invisible too:
-- announcement_visible_to_me() reads the table with owner rights.
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
      AND a.deleted_at IS NULL
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

-- ── Resource categories ─────────────────────────────────────────────────────
ALTER TABLE public.resource_categories
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id);

-- Names stay unique among live categories only, so a deleted name can be reused.
DROP INDEX IF EXISTS public.resource_categories_name_unique;
CREATE UNIQUE INDEX resource_categories_name_unique
  ON public.resource_categories (lower(btrim(name))) WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS "resource_categories: not deleted" ON public.resource_categories;
CREATE POLICY "resource_categories: not deleted" ON public.resource_categories AS RESTRICTIVE
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
DROP POLICY IF EXISTS "resource_categories: no client delete" ON public.resource_categories;
CREATE POLICY "resource_categories: no client delete" ON public.resource_categories AS RESTRICTIVE
  FOR DELETE TO authenticated USING (false);

-- Same rule as before: a category used by a (live) resource can only be
-- deactivated. Deleting also deactivates it, so the existing "choose an
-- active category" rule refuses it for any resource from now on.
CREATE OR REPLACE FUNCTION public.soft_delete_resource_category(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat public.resource_categories;
  v_count int;
BEGIN
  IF NOT public.is_active_user() OR NOT public.cert_can('manage_resource_categories') THEN
    RAISE EXCEPTION 'You don’t have permission to manage resource categories.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_cat FROM public.resource_categories WHERE id = p_id AND deleted_at IS NULL;
  IF v_cat.id IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM public.resources WHERE category_id = p_id AND deleted_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'The category "%" is used by % resource(s), so it can''t be deleted. Deactivate it instead.', v_cat.name, v_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  PERFORM set_config('hmm.soft_delete', 'on', true);
  UPDATE public.resource_categories SET deleted_at = now(), deleted_by = auth.uid(), is_active = false WHERE id = p_id;
  PERFORM set_config('hmm.soft_delete', 'off', true);
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'resource_category.deleted', 'resource_category', p_id, jsonb_build_object('name', v_cat.name, 'soft_delete', true));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_resource_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_resource_category(uuid) TO authenticated;

-- ── deleted_at only through the functions above ────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_soft_delete_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.cert_is_system() THEN RETURN NEW; END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This item has been deleted.' USING ERRCODE = '42501';
  END IF;
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by)
     AND coalesce(current_setting('hmm.soft_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the delete function to delete this item.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_soft_delete_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_announcements_soft_delete ON public.announcements;
CREATE TRIGGER trg_announcements_soft_delete
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.guard_soft_delete_columns();
DROP TRIGGER IF EXISTS trg_resource_categories_soft_delete ON public.resource_categories;
CREATE TRIGGER trg_resource_categories_soft_delete
  BEFORE UPDATE ON public.resource_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_soft_delete_columns();
