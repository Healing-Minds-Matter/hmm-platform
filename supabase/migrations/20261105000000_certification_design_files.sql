-- Certificate designs (Epic 10, Phase 5): allow SVG images in the certification-files bucket.
--
-- New paths, written only by the server (admin client) after checking the user's permission:
--   designs/{type_id}/{file}            design artwork: templates (PNG/JPG, 5 MB) and images (PNG/JPG/SVG, 2 MB)
--   pdfs/{holder_id}/{certificate_id}/{file}   generated digital certificates
-- Both are shown through short-lived signed links made by the server, so no new read policy is needed.
-- Story 10.3 Sc04 allows SVG images (logos, signatures, seals); the bucket only accepted PDF, JPG and PNG.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/svg+xml']
WHERE id = 'certification-files';
