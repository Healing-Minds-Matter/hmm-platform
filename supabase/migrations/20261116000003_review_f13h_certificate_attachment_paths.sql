-- Review Finding 13h: a certificate's attachment can only be a file in the
-- certificate holder's own folder.
--
-- Before: attachment_path was any text. Storage let someone read a file in
-- the certification-files bucket if ANY certificate they could see named it.
-- So a Gatekeeper could save a self-reported certificate whose
-- attachment_path was another person's file (certificates/{someone}/… or
-- self/{someone}/…), and then open that file; a Champion could do the same
-- through edit_certificate(p_attachment_path => …).
--
-- Now:
--   1. The database checks the path is inside the holder's folder:
--        certificates.attachment_path               certificates/{holder_id}/{file}
--        self_reported_certificates.attachment_path self/{holder_id}/{file}
--      ({file}: one name, letters, digits, dot, dash, underscore — no
--      sub-folders). The server (web) already builds these paths from the
--      certificate's holder; the app builds self/{own id}/… and RLS only lets
--      people save their own self-reported certificates.
--   2. Storage only serves a file through a certificate that sits in the same
--      holder's folder, so the read rule matches the check above.
--
-- Existing rows aren't rewritten. The checks are added NOT VALID (they apply
-- to every new or changed row at once) and then validated if every existing
-- row already passes; otherwise a notice reports how many need a look and
-- the check stays in force for changes.

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_attachment_in_holder_folder;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_attachment_in_holder_folder CHECK (
    attachment_path IS NULL
    OR attachment_path ~ ('^certificates/' || holder_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
  ) NOT VALID;

ALTER TABLE public.self_reported_certificates DROP CONSTRAINT IF EXISTS self_reported_attachment_in_holder_folder;
ALTER TABLE public.self_reported_certificates
  ADD CONSTRAINT self_reported_attachment_in_holder_folder CHECK (
    attachment_path IS NULL
    OR attachment_path ~ ('^self/' || holder_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
  ) NOT VALID;

DO $$
DECLARE v_bad_official int; v_bad_self int;
BEGIN
  SELECT count(*) INTO v_bad_official FROM public.certificates
  WHERE attachment_path IS NOT NULL
    AND attachment_path !~ ('^certificates/' || holder_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$');
  SELECT count(*) INTO v_bad_self FROM public.self_reported_certificates
  WHERE attachment_path IS NOT NULL
    AND attachment_path !~ ('^self/' || holder_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$');

  IF v_bad_official = 0 THEN
    ALTER TABLE public.certificates VALIDATE CONSTRAINT certificates_attachment_in_holder_folder;
  ELSE
    RAISE NOTICE 'Review Finding 13h: % official certificate(s) have an attachment outside the holder''s folder', v_bad_official;
  END IF;
  IF v_bad_self = 0 THEN
    ALTER TABLE public.self_reported_certificates VALIDATE CONSTRAINT self_reported_attachment_in_holder_folder;
  ELSE
    RAISE NOTICE 'Review Finding 13h: % self-reported certificate(s) have an attachment outside the holder''s folder', v_bad_self;
  END IF;
END;
$$;

-- Storage: a file is readable only through a certificate the caller can see
-- (RLS on the certificate tables applies inside these sub-queries) that
-- belongs to the person whose folder the file is in.
DROP POLICY IF EXISTS "certification files: read with the certificate" ON storage.objects;
CREATE POLICY "certification files: read with the certificate" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'certification-files'
    AND (
      ((storage.foldername(name))[1] = 'certificates'
        AND EXISTS (SELECT 1 FROM public.certificates c
                    WHERE c.attachment_path = storage.objects.name
                      AND c.holder_id::text = (storage.foldername(storage.objects.name))[2]))
      OR
      ((storage.foldername(name))[1] = 'self'
        AND EXISTS (SELECT 1 FROM public.self_reported_certificates s
                    WHERE s.attachment_path = storage.objects.name
                      AND s.holder_id::text = (storage.foldername(storage.objects.name))[2]))
    )
  );
