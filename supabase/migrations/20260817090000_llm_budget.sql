-- Central LLM spend ceiling — one llm_budget row per caller, consumed atomically
-- through llm_budget_consume(p_caller, p_n).
--
-- Why: daily LLM caps were ~86 bespoke count-queries scattered across edge
-- functions (enrichment_log counts, in-run counters), and the single largest
-- mis-priced call site (marketplace-description-enhance — the 70B on a */5
-- cron) had NO cap at all. This table is the one place a per-caller spend
-- ceiling lives. `AI_DISABLED=1` (in _shared/openai-client.ts) stays the
-- GLOBAL hard stop above it; this only bounds per-caller daily volume.
--
-- Adoption is incremental (half-ship safe): callers try the RPC and fall back
-- to their legacy counting — or uncapped-with-console-warn where no legacy cap
-- existed — when the RPC is absent, so an edge function can deploy before this
-- migration applies without breaking. Unknown caller_keys self-register on
-- first consume at a conservative default cap of 200/day.

CREATE TABLE IF NOT EXISTS public.llm_budget (
  caller_key   text PRIMARY KEY,
  daily_cap    integer NOT NULL,
  spent_today  integer NOT NULL DEFAULT 0,
  window_start date NOT NULL DEFAULT current_date,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policies: nothing but service_role (which bypasses RLS) ever
-- reads it. This project's default privileges arm anon/authenticated on new
-- tables, so the explicit REVOKEs are load-bearing (see the anon-write-grants
-- P0, PR #2450).
ALTER TABLE public.llm_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_budget FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.llm_budget TO service_role;

-- Atomic consume: rolls the daily window when stale, then spends p_n only if
-- the result stays within daily_cap. The cap check lives in the UPDATE's WHERE
-- clause, so under READ COMMITTED concurrent consumers re-evaluate it against
-- the committed row after waiting on the row lock (EvalPlanQual) — two racers
-- can never jointly overshoot the cap. p_n = 0 is a valid probe: it reports
-- remaining/cap/spent without spending.
CREATE OR REPLACE FUNCTION public.llm_budget_consume(p_caller text, p_n integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer := greatest(coalesce(p_n, 1), 0);
  v_remaining integer;
  v_spent integer;
  v_cap integer;
BEGIN
  IF p_caller IS NULL OR btrim(p_caller) = '' THEN
    -- A bookkeeping bug is not a reason to block inference: fail open.
    RETURN jsonb_build_object('allowed', true, 'remaining', NULL, 'error', 'missing_caller');
  END IF;

  -- Self-register unknown callers at a conservative default cap.
  INSERT INTO public.llm_budget (caller_key, daily_cap)
  VALUES (p_caller, 200)
  ON CONFLICT (caller_key) DO NOTHING;

  UPDATE public.llm_budget b
     SET spent_today  = (CASE WHEN b.window_start < current_date THEN 0 ELSE b.spent_today END) + v_n,
         window_start = current_date,
         updated_at   = now()
   WHERE b.caller_key = p_caller
     AND (CASE WHEN b.window_start < current_date THEN 0 ELSE b.spent_today END) + v_n <= b.daily_cap
  RETURNING b.daily_cap - b.spent_today, b.spent_today, b.daily_cap
    INTO v_remaining, v_spent, v_cap;

  IF FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', v_remaining, 'cap', v_cap, 'spent', v_spent);
  END IF;

  -- Denied: report the (window-rolled) spend without persisting anything.
  SELECT daily_cap, CASE WHEN window_start < current_date THEN 0 ELSE spent_today END
    INTO v_cap, v_spent
    FROM public.llm_budget WHERE caller_key = p_caller;

  RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'cap', v_cap, 'spent', v_spent);
END;
$$;

REVOKE ALL ON FUNCTION public.llm_budget_consume(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.llm_budget_consume(text, integer) TO service_role;

-- Seeded callers. marketplace-relevance keeps its legacy 800/day counting for
-- now — the row is pre-provisioned for its later adoption.
INSERT INTO public.llm_budget (caller_key, daily_cap) VALUES
  ('marketplace-description-enhance', 500),
  ('marketplace-relevance', 800),
  ('event-agentic-enrich', 60),
  ('city-agentic-enrich', 120),
  ('pipeline-enrich-news', 600)
ON CONFLICT (caller_key) DO NOTHING;
