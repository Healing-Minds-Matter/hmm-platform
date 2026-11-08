-- Resource categories as managed data (sheet row 26).
--
-- Until now the category list was hard-coded in lib/resource-categories.ts and
-- resources.category held the name as free text. This adds:
--   resource_categories      Super Admins create, rename and deactivate categories
--   resources.category_id    the category a resource belongs to (can't be deleted while used)
--   manage_resource_categories  permission key (Super-Admin-only, like upload_clinical_guides)
--
-- resources.category (text) is kept and filled from category_id by a trigger,
-- because the current mobile build reads and filters on it. A rename updates
-- every linked resource's text too.
--
-- Rules enforced here, not only in the app:
--   * names are unique regardless of capitals and spaces
--   * a category used by any resource can't be deleted, only deactivated
--   * a new or changed resource category must be an active one
--   * only users with manage_resource_categories (Super Admins) can change categories
--   * every change is written to audit_logs (who, when, what)

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  is_active     boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_categories_name_unique
  ON public.resource_categories (lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_resource_categories_updated_at ON public.resource_categories;
CREATE TRIGGER trg_resource_categories_updated_at
  BEFORE UPDATE ON public.resource_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Permission key ──────────────────────────────────────────────────────────
INSERT INTO public.permission_catalog (key, label, description, category, display_order, restricted_to) VALUES
  ('manage_resource_categories', 'Manage Resource Categories',
   'Create, rename and deactivate the categories resources are filed under.',
   'Learning Resources & Library', 14, 'super_admin')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permissions (role, permission, is_enabled) VALUES
  ('champion', 'manage_resource_categories', false),
  ('gatekeeper', 'manage_resource_categories', false)
ON CONFLICT (role, permission) DO NOTHING;

-- ── Existing data ───────────────────────────────────────────────────────────
-- The list that was hard-coded in lib/resource-categories.ts, in its order.
INSERT INTO public.resource_categories (name, display_order)
SELECT v.name, v.ord
FROM (VALUES
  ('Certification Training', 1),
  ('Warning Signs & Risk Awareness', 2),
  ('Crisis Support & Referral', 3),
  ('Guides & Protocols', 4),
  ('Facilitator Kits', 5),
  ('Awareness Programmes', 6),
  ('Self-Care & Wellbeing', 7),
  ('Mental Health Basics', 8),
  ('Club & Programme Admin', 9),
  ('Other', 10)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.resource_categories c WHERE lower(btrim(c.name)) = lower(btrim(v.name)));

-- Older free-text categories still on some resources (from before the fixed
-- list) become inactive categories, so those resources stay linked but the
-- names aren't offered for new resources.
INSERT INTO public.resource_categories (name, is_active, display_order)
SELECT DISTINCT ON (lower(btrim(r.category))) btrim(r.category), false, 100
FROM public.resources r
WHERE r.category IS NOT NULL AND btrim(r.category) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.resource_categories c WHERE lower(btrim(c.name)) = lower(btrim(r.category)))
ORDER BY lower(btrim(r.category)), btrim(r.category);

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.resource_categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_resources_category_id ON public.resources(category_id);

UPDATE public.resources r
SET category_id = c.id
FROM public.resource_categories c
WHERE r.category_id IS NULL AND lower(btrim(r.category)) = lower(btrim(c.name));

-- ── Triggers ────────────────────────────────────────────────────────────────
-- Keep resources.category (text) matching category_id; resolve a name written
-- by an older client; refuse inactive categories on a new or changed choice.
CREATE OR REPLACE FUNCTION public.resources_category_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat public.resource_categories;
BEGIN
  IF NEW.category_id IS NULL AND NEW.category IS NOT NULL AND btrim(NEW.category) <> ''
     AND (TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category) THEN
    SELECT * INTO v_cat FROM public.resource_categories WHERE lower(btrim(name)) = lower(btrim(NEW.category));
    IF v_cat.id IS NULL THEN
      RAISE EXCEPTION 'Choose a category from the list.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.category_id := v_cat.id;
  END IF;

  IF NEW.category_id IS NULL THEN
    NEW.category := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO v_cat FROM public.resource_categories WHERE id = NEW.category_id;
  IF TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    IF NOT v_cat.is_active THEN
      RAISE EXCEPTION 'The category "%" has been deactivated. Choose an active category.', v_cat.name
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.category := v_cat.name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resources_category_sync ON public.resources;
CREATE TRIGGER trg_resources_category_sync
  BEFORE INSERT OR UPDATE OF category, category_id ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.resources_category_sync();

-- A rename updates the text on every resource filed under it.
CREATE OR REPLACE FUNCTION public.resource_categories_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text; v_details jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.resources SET category = NEW.name WHERE category_id = NEW.id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'resource_category.created';
    v_details := jsonb_build_object('name', NEW.name, 'is_active', NEW.is_active);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'resource_category.deleted';
    v_details := jsonb_build_object('name', OLD.name);
  ELSIF NEW.name IS DISTINCT FROM OLD.name AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    v_action := 'resource_category.updated';
    v_details := jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name, 'is_active', NEW.is_active);
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    v_action := 'resource_category.renamed';
    v_details := jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name);
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    v_action := CASE WHEN NEW.is_active THEN 'resource_category.reactivated' ELSE 'resource_category.deactivated' END;
    v_details := jsonb_build_object('name', NEW.name);
  ELSE
    RETURN NULL; -- nothing worth logging (e.g. display order)
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_action, 'resource_category', coalesce(NEW.id, OLD.id), v_details);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_categories_after ON public.resource_categories;
CREATE TRIGGER trg_resource_categories_after
  AFTER INSERT OR UPDATE OR DELETE ON public.resource_categories
  FOR EACH ROW EXECUTE FUNCTION public.resource_categories_after();

-- A plain-English refusal instead of the foreign-key error.
CREATE OR REPLACE FUNCTION public.resource_categories_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.resources WHERE category_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'The category "%" is used by % resource(s), so it can''t be deleted. Deactivate it instead.', OLD.name, v_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_categories_before_delete ON public.resource_categories;
CREATE TRIGGER trg_resource_categories_before_delete
  BEFORE DELETE ON public.resource_categories
  FOR EACH ROW EXECUTE FUNCTION public.resource_categories_before_delete();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_categories: authenticated read" ON public.resource_categories;
CREATE POLICY "resource_categories: authenticated read" ON public.resource_categories
  FOR SELECT TO authenticated USING (true);

-- cert_can() is the shared Epic 9 resolver (Super Admins pass; a
-- Super-Admin-only key never applies to anyone else).
DROP POLICY IF EXISTS "resource_categories: manage insert" ON public.resource_categories;
CREATE POLICY "resource_categories: manage insert" ON public.resource_categories
  FOR INSERT TO authenticated WITH CHECK (public.cert_can('manage_resource_categories'));
DROP POLICY IF EXISTS "resource_categories: manage update" ON public.resource_categories;
CREATE POLICY "resource_categories: manage update" ON public.resource_categories
  FOR UPDATE TO authenticated
  USING (public.cert_can('manage_resource_categories'))
  WITH CHECK (public.cert_can('manage_resource_categories'));
DROP POLICY IF EXISTS "resource_categories: manage delete" ON public.resource_categories;
CREATE POLICY "resource_categories: manage delete" ON public.resource_categories
  FOR DELETE TO authenticated USING (public.cert_can('manage_resource_categories'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_categories TO authenticated;
