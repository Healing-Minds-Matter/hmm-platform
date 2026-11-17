-- Review Finding 10: a per-account and per-IP limit on password attempts and
-- password-reset requests for the web portals.
--
-- Every web sign-in reaches Supabase from the server's own IP address, so
-- Supabase's per-IP limit can't tell one attacker from everyone else. The
-- web server now counts attempts itself, here, before Supabase is called.
--
-- auth_throttle: one row per counter. key is "<what>:<account|ip>:<hash>";
-- the hash is an HMAC made by the server, so no email address or IP address
-- is stored. RLS is on with no policies and no table grants: only these
-- SECURITY DEFINER functions touch it, and only the server (service role)
-- may call them. The limits themselves (counts, windows, block lengths)
-- come from one config file on the server (lib/auth/throttle-config.ts).
--
-- Rows clean themselves up: each call removes rows whose expires_at has
-- passed (an index keeps that cheap).

CREATE TABLE IF NOT EXISTS public.auth_throttle (
  key               text        PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 200),
  count             integer     NOT NULL DEFAULT 0,          -- failures (login) or requests (reset) in this window
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until     timestamptz,                             -- login only
  lockouts          integer     NOT NULL DEFAULT 0,          -- recent lockouts, for the doubling block
  expires_at        timestamptz NOT NULL                     -- safe to delete after this
);
CREATE INDEX IF NOT EXISTS idx_auth_throttle_expires ON public.auth_throttle (expires_at);

ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_throttle FROM PUBLIC, anon, authenticated, service_role;

-- ── Is any of these counters blocking right now? ───────────────────────────
-- Returns the latest blocked_until still in the future, or NULL.
CREATE OR REPLACE FUNCTION public.auth_throttle_blocked_until(p_keys text[])
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(blocked_until)
  FROM public.auth_throttle
  WHERE key = ANY (p_keys) AND blocked_until > now();
$$;

-- ── Record one failed password attempt ─────────────────────────────────────
-- p_max failures inside p_window_seconds start a block of
-- p_base_block_seconds, doubled for each earlier lockout still remembered,
-- capped at p_max_block_seconds. A lockout is forgotten
-- p_lockout_memory_seconds after its block ended.
-- Returns locked = true only on the attempt that started a block.
CREATE OR REPLACE FUNCTION public.auth_throttle_record_failure(
  p_key text,
  p_max integer,
  p_window_seconds integer,
  p_base_block_seconds integer,
  p_max_block_seconds integer,
  p_lockout_memory_seconds integer
)
RETURNS TABLE (locked boolean, blocked_until timestamptz, lockouts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auth_throttle;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
  v_memory interval := make_interval(secs => p_lockout_memory_seconds);
  v_locked boolean := false;
  v_block_secs double precision;
BEGIN
  IF p_max < 1 OR p_window_seconds < 1 OR p_base_block_seconds < 1
     OR p_max_block_seconds < p_base_block_seconds OR p_lockout_memory_seconds < 0 THEN
    RAISE EXCEPTION 'Invalid throttle settings.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.auth_throttle t WHERE t.expires_at < v_now;

  INSERT INTO public.auth_throttle AS t (key, window_started_at, expires_at)
  VALUES (p_key, v_now, v_now + v_window)
  ON CONFLICT (key) DO NOTHING;
  -- Row lock: parallel attempts on one counter are counted one after another.
  SELECT * INTO r FROM public.auth_throttle t WHERE t.key = p_key FOR UPDATE;

  IF r.blocked_until IS NOT NULL AND r.blocked_until > v_now THEN
    -- Already blocked (a request that passed the check just before the block
    -- began). Don't extend it.
    RETURN QUERY SELECT false, r.blocked_until, r.lockouts;
    RETURN;
  END IF;

  IF r.blocked_until IS NOT NULL AND r.blocked_until + v_memory < v_now THEN
    r.lockouts := 0;
  END IF;
  IF r.window_started_at + v_window <= v_now THEN
    r.count := 0;
    r.window_started_at := v_now;
  END IF;

  r.count := r.count + 1;
  IF r.count >= p_max THEN
    r.lockouts := r.lockouts + 1;
    v_block_secs := least(p_base_block_seconds * power(2, least(r.lockouts - 1, 30)), p_max_block_seconds);
    r.blocked_until := v_now + make_interval(secs => v_block_secs);
    r.count := 0;
    r.window_started_at := v_now;
    v_locked := true;
  END IF;

  r.expires_at := greatest(
    r.window_started_at + v_window,
    coalesce(r.blocked_until + v_memory, v_now)
  );

  UPDATE public.auth_throttle t
  SET count = r.count, window_started_at = r.window_started_at, blocked_until = r.blocked_until,
      lockouts = r.lockouts, expires_at = r.expires_at
  WHERE t.key = p_key;

  RETURN QUERY SELECT v_locked, r.blocked_until, r.lockouts;
END;
$$;

-- ── A successful sign-in: forget this counter ──────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_throttle_clear(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_throttle WHERE key = p_key;
$$;

-- ── Count one request against a simple limit (password-reset requests) ─────
-- Returns true if this request is within p_max per p_window_seconds (and
-- counts it), false if the limit is already reached (not counted).
CREATE OR REPLACE FUNCTION public.auth_throttle_hit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.auth_throttle;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
BEGIN
  IF p_max < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid throttle settings.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.auth_throttle t WHERE t.expires_at < v_now;

  INSERT INTO public.auth_throttle AS t (key, window_started_at, expires_at)
  VALUES (p_key, v_now, v_now + v_window)
  ON CONFLICT (key) DO NOTHING;
  SELECT * INTO r FROM public.auth_throttle t WHERE t.key = p_key FOR UPDATE;

  IF r.window_started_at + v_window <= v_now THEN
    r.count := 0;
    r.window_started_at := v_now;
  END IF;
  IF r.count >= p_max THEN
    RETURN false;
  END IF;

  UPDATE public.auth_throttle t
  SET count = r.count + 1, window_started_at = r.window_started_at, expires_at = r.window_started_at + v_window
  WHERE t.key = p_key;
  RETURN true;
END;
$$;

-- Server only. Signed-out and signed-in clients can't call any of these.
REVOKE ALL ON FUNCTION public.auth_throttle_blocked_until(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_throttle_record_failure(text, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_throttle_clear(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_throttle_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_throttle_blocked_until(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_throttle_record_failure(text, integer, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_throttle_clear(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_throttle_hit(text, integer, integer) TO service_role;
