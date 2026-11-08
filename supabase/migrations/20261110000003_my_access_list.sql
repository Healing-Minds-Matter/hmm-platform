-- Role & Access on the profile pages (sheet row 62).
--
-- my_access_list(): every catalogued permission the signed-in user actually
-- has right now, with the same labels and categories as the Permissions
-- screens. Resolved by cert_can() — the shared Epic 9 engine: individual
-- exception > group (deny wins) > role default, plus access borrowed through
-- an active delegation, and Super Admins have everything except keys that
-- don't apply to them. Replaces the hard-coded lists on the profile pages.
CREATE OR REPLACE FUNCTION public.my_access_list()
RETURNS TABLE (key text, label text, category text, display_order int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.key, k.label, k.category, k.display_order
  FROM public.permission_catalog k
  WHERE auth.uid() IS NOT NULL
    AND public.cert_can(k.key)
  ORDER BY k.category, k.display_order, k.label;
$$;

REVOKE ALL ON FUNCTION public.my_access_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_list() TO authenticated;
