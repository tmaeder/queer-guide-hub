-- NVIDIA NIM as the first-choice LLM provider, with Cloudflare Workers AI under it.
--
-- Three things the edge-side router needs and cannot provide for itself:
--   1. llm_provider_rate + llm_rate_acquire — a leaky bucket that holds across
--      isolates, because the provider's ~40 RPM ceiling is an ACCOUNT limit and
--      edge functions are stateless and horizontally scaled.
--   2. llm_call_log.provider — NVIDIA is not one of AI Gateway's 24 supported
--      providers, so this column is the only record anywhere that the path ran.
--   3. A seeded api_circuit_breakers row. Two reasons, and the second is the
--      one that bites: checkCircuit() returns allowed=true whenever the row is
--      absent (the omission that left wikipedia.api / wikidata.api /
--      osm.nominatim unprotected for their whole lives), and although
--      circuit_breaker_record_failure() does auto-register on first failure, it
--      does so at the DEFAULT threshold 5 / reset 120s. Seeding is how this
--      breaker gets the thresholds chosen for it below instead.

-- ---------------------------------------------------------------------------
-- 1. Rate limiting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.llm_provider_rate (
  provider_key text PRIMARY KEY,
  -- Sustained refill rate. Tune with a plain UPDATE; no migration needed.
  rpm_cap      integer NOT NULL,
  -- Bucket depth: how much burst a quiet period may bank.
  burst        integer NOT NULL,
  tokens       numeric NOT NULL DEFAULT 0,
  last_refill  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.llm_provider_rate IS
  'Leaky-bucket rate limiter for external LLM providers with an account-wide RPM ceiling. Deliberately a bucket rather than a per-minute window: a fixed window permits rpm_cap calls in the last second of one minute and rpm_cap more in the first second of the next, which is exactly the burst the provider rejects.';

-- RLS on with no policies — only service_role (which bypasses RLS) touches it.
-- This project's default privileges arm anon/authenticated on new tables, so the
-- explicit REVOKEs are load-bearing (anon-write-grants P0, PR #2450).
ALTER TABLE public.llm_provider_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_provider_rate FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.llm_provider_rate TO service_role;

-- Take p_n slots, or report how long until they exist.
--
-- Concurrency, same mechanism as llm_budget_consume: the availability test lives
-- in the UPDATE's WHERE clause, so under READ COMMITTED a second consumer that
-- waits on the row lock re-evaluates the test against the committed row
-- (EvalPlanQual) and is correctly denied. Two racers cannot jointly overdraw.
--
-- now() is transaction start time and therefore stable within the statement, so
-- the refill term cannot drift mid-evaluation.
CREATE OR REPLACE FUNCTION public.llm_rate_acquire(p_provider text, p_n integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n     integer := greatest(coalesce(p_n, 1), 1);
  v_left  numeric;
  v_cap   integer;
  v_avail numeric;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    -- A bookkeeping bug must not silently grant unlimited slots. Deny; the
    -- caller falls back to the other provider, which is the safe direction.
    RETURN jsonb_build_object('granted', false, 'retry_after_ms', 0, 'error', 'missing_provider');
  END IF;

  -- Self-register unknown providers conservatively, mirroring llm_budget.
  INSERT INTO public.llm_provider_rate (provider_key, rpm_cap, burst, tokens)
  VALUES (p_provider, 30, 10, 10)
  ON CONFLICT (provider_key) DO NOTHING;

  UPDATE public.llm_provider_rate r
     SET tokens = least(
                    r.burst::numeric,
                    r.tokens + extract(epoch FROM (now() - r.last_refill)) * r.rpm_cap / 60.0
                  ) - v_n,
         last_refill = now(),
         updated_at  = now()
   WHERE r.provider_key = p_provider
     AND least(
           r.burst::numeric,
           r.tokens + extract(epoch FROM (now() - r.last_refill)) * r.rpm_cap / 60.0
         ) >= v_n
  RETURNING r.tokens INTO v_left;

  IF FOUND THEN
    RETURN jsonb_build_object('granted', true, 'retry_after_ms', 0, 'tokens_left', v_left);
  END IF;

  -- Denied. Report the wait implied by the refill rate so the caller can sleep
  -- exactly as long as it needs to rather than polling.
  SELECT r.rpm_cap,
         least(
           r.burst::numeric,
           r.tokens + extract(epoch FROM (now() - r.last_refill)) * r.rpm_cap / 60.0
         )
    INTO v_cap, v_avail
    FROM public.llm_provider_rate r
   WHERE r.provider_key = p_provider;

  RETURN jsonb_build_object(
    'granted', false,
    'retry_after_ms',
      greatest(
        0,
        ceil((v_n - coalesce(v_avail, 0)) / (greatest(coalesce(v_cap, 1), 1)::numeric / 60.0) * 1000)
      )::int,
    'tokens_left', coalesce(v_avail, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.llm_rate_acquire(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_rate_acquire(text, integer) TO service_role;

-- Seeded at 32, not the documented 40: headroom for clock skew between the
-- bucket and the provider's own accounting, and for in-flight retries. A 429
-- reaching the router at all means this number is too high.
INSERT INTO public.llm_provider_rate (provider_key, rpm_cap, burst, tokens)
VALUES ('nvidia', 32, 10, 10)
ON CONFLICT (provider_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Provider attribution on the call log
-- ---------------------------------------------------------------------------

ALTER TABLE public.llm_call_log ADD COLUMN IF NOT EXISTS provider text;

COMMENT ON COLUMN public.llm_call_log.provider IS
  'Which backend served the call (cloudflare | nvidia | openai | anthropic). NVIDIA cannot be routed through Cloudflare AI Gateway, so for that provider this column is the only record the call happened. cost_usd stays NULL for NVIDIA on purpose: llm-cost.ts prices only @cf/ models, and per its null contract an invented zero is indistinguishable from "this model is free" — which is the exact illusion that logging exists to break.';

-- Existing rows all predate any non-Cloudflare routing on this path.
UPDATE public.llm_call_log SET provider = 'cloudflare' WHERE provider IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Circuit breaker
-- ---------------------------------------------------------------------------

-- threshold 3 / reset 900s. Low threshold because the fallback is free to reach
-- and always available: there is no value in probing a broken provider when
-- Cloudflare is one branch away. 15 minutes is short enough that a transient
-- outage self-heals within one cron cycle, and long enough that an exhausted
-- free tier is not re-probed on every item of a 300-row batch.
SELECT public.register_circuit_breaker('llm.nvidia', 3, 900);
