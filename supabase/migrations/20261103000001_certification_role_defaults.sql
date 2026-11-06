-- Fix for 20261103000000_certifications.sql: its role-default seed skipped every default that should
-- be switched on. `NOT (restricted_to = 'super_admin' AND ...)` is NULL (so the row is left out) when
-- restricted_to is NULL, which is every key that isn't Super-Admin-only. Only the "off" rows were added.
--
-- Adds the missing rows and switches on the ones that should be on. Safe to run more than once.
-- Never switches on a Super-Admin-only key (the trigger from that migration would refuse it anyway).

INSERT INTO public.permissions (role, permission, is_enabled)
SELECT r.role::public.user_role, k.key, k.key = ANY (r.enabled) AND k.restricted_to IS DISTINCT FROM 'super_admin'
FROM (VALUES
  ('champion', ARRAY['certifications.types.view', 'certifications.award', 'certifications.official.edit', 'certifications.official.remove',
                     'certifications.attachments.manage', 'certifications.digital.generate', 'certifications.self.manage',
                     'certifications.review.view', 'certifications.review.verify', 'certifications.review.remove', 'certifications.journey.view']),
  ('gatekeeper', ARRAY['certifications.self.manage'])
) AS r(role, enabled)
CROSS JOIN public.permission_catalog k
WHERE k.category = 'Certifications'
ON CONFLICT (role, permission) DO NOTHING;
