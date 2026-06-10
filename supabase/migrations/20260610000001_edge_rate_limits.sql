-- Per-user rate limiting for cost-bearing LLM edge functions (2026-06-10).
-- Backs _shared/user-rate-limit.ts checkUserRateLimit().

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  bucket_key text PRIMARY KEY,
  hits       integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS edge_rate_limits_expires_idx
  ON public.edge_rate_limits (expires_at);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) touches this table.

-- Atomic increment within a fixed window bucket. Returns true if the call is
-- within the limit, false if it should be rejected.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key text,
  p_window integer,
  p_max integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_win bigint;
  v_hits integer;
BEGIN
  v_win := floor(extract(epoch FROM now()) / p_window);
  INSERT INTO public.edge_rate_limits (bucket_key, hits, expires_at)
    VALUES (p_key || '|' || v_win, 1, now() + make_interval(secs => p_window))
  ON CONFLICT (bucket_key)
    DO UPDATE SET hits = public.edge_rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

-- Hourly purge of expired buckets (table stays tiny).
SELECT cron.schedule(
  'edge-rate-limits-purge',
  '7 * * * *',
  $$DELETE FROM public.edge_rate_limits WHERE expires_at < now()$$
);
