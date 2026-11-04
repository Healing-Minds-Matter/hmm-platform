-- Daily certificate expiry reminders (Epic 10, Story 10.14 Sc04).
--
-- RUN THIS ONLY WHEN THE CERTIFICATIONS FEATURE IS RELEASED. The database is shared
-- with the live site: once scheduled, real Champions and Gatekeepers start getting
-- reminders (see 20261106000000_certificate_expiry_reminders.sql).
--
-- Every day at 06:00 Sri Lanka time (00:30 UTC). Needs the pg_cron extension
-- (Supabase: Database → Extensions → pg_cron, or the statement below).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'certificate-expiry-reminders',
  '30 0 * * *',
  $$SELECT public.cert_send_expiry_reminders()$$
);
