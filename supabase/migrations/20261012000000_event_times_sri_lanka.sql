-- Event times were saved as if the time typed into the form were UTC: an
-- event created for 14:58 Sri Lanka time was stored as 14:58 UTC, which is
-- really 20:28 in Sri Lanka. Screens happened to show the typed time, but
-- anything comparing with the real current time ("upcoming", "recently
-- completed", the mobile app) was 5½ hours off.
--
-- The app now saves typed times as Sri Lanka time (UTC+05:30, no daylight
-- saving) and shows times in Sri Lanka time — see lib/org-date.ts. This moves
-- every event saved the old way back by 5 hours 30 minutes, so the times
-- users see stay exactly the same while the stored moments become correct.
--
-- Run ONCE, right after the code that saves Sri Lanka time is live. Events
-- created with the new code (after the deploy, before this runs) would be
-- shifted wrongly, so avoid creating events in between.
--
-- Safeguard: running it twice would shift everything again. It records that
-- it has run (in a comment on events.starts_at) and does nothing the second
-- time.

DO $$
DECLARE
  marker CONSTANT TEXT := 'Stored as real UTC moments; entered and shown in Sri Lanka time (Asia/Colombo).';
  shifted INTEGER;
BEGIN
  IF col_description('public.events'::regclass, (
       SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.events'::regclass AND attname = 'starts_at'
     )) = marker THEN
    RAISE NOTICE 'Event times were already corrected — nothing changed.';
    RETURN;
  END IF;

  UPDATE public.events
  SET starts_at = starts_at - INTERVAL '5 hours 30 minutes',
      ends_at   = ends_at   - INTERVAL '5 hours 30 minutes'
  WHERE created_at < now();
  GET DIAGNOSTICS shifted = ROW_COUNT;

  EXECUTE format('COMMENT ON COLUMN public.events.starts_at IS %L', marker);
  COMMENT ON COLUMN public.events.ends_at IS 'Same as starts_at: a real UTC moment, entered and shown in Sri Lanka time.';

  RAISE NOTICE 'Corrected % event(s).', shifted;
END;
$$;
