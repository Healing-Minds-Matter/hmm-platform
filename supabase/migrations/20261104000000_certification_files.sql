-- Certificate attachments (Epic 10, Phase 3): a private storage bucket.
--
-- Paths:  certificates/{holder_id}/{file}   official certificate attachments (uploaded by the server
--                                            after it has checked the user may add or edit that certificate)
--         self/{holder_id}/{file}           self-reported certificate attachments (Phase 4; the mobile app
--                                            uploads these itself, so holders may upload into their own folder)
-- PDF, JPG or PNG, up to 10 MB (Stories 10.5 Sc03, 10.9 Sc01).
--
-- A file can be read by anyone who can see the certificate that uses it; the screens hand out short-lived
-- signed links, so nothing in this bucket is public.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certification-files', 'certification-files', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "certification files: read with the certificate" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'certification-files'
    AND (EXISTS (SELECT 1 FROM public.certificates c WHERE c.attachment_path = storage.objects.name)
         OR EXISTS (SELECT 1 FROM public.self_reported_certificates s WHERE s.attachment_path = storage.objects.name))
  );

CREATE POLICY "certification files: holders upload their own self-reported files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'certification-files'
    AND (storage.foldername(name))[1] = 'self'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.cert_can('certifications.self.manage')
  );
