-- Decision 2 (after Security Finding 6): a clean-up job removes the stored
-- files of resources that were soft-deleted more than N days ago (default 30).
-- The job is trusted server code (app/api/cron/purge-deleted-files, service
-- role); the resource row itself is kept, marked with file_purged_at.

ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_purged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_resources_pending_file_purge
  ON public.resources (deleted_at)
  WHERE deleted_at IS NOT NULL AND file_purged_at IS NULL;
