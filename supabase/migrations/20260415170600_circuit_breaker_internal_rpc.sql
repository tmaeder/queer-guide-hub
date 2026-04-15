-- Wave 2 — Register internal RPCs and pipeline stages with api_circuit_breakers
-- so failures (slow queries, RPC errors, LLM timeouts) trip a fast-fail breaker
-- instead of holding up the whole pipeline.

BEGIN;

-- Idempotent registration helper
CREATE OR REPLACE FUNCTION register_circuit_breaker(
  p_api_name text,
  p_threshold int DEFAULT 5,
  p_reset_seconds int DEFAULT 120
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO api_circuit_breakers(api_name, state, threshold, reset_timeout_seconds)
  VALUES (p_api_name, 'closed', p_threshold, p_reset_seconds)
  ON CONFLICT (api_name) DO UPDATE
    SET threshold = EXCLUDED.threshold,
        reset_timeout_seconds = EXCLUDED.reset_timeout_seconds,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_circuit_breaker(text, int, int)
  TO authenticated, service_role;

-- Trip + reset helpers used by edge functions
CREATE OR REPLACE FUNCTION circuit_breaker_record_failure(
  p_api_name text,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row api_circuit_breakers%ROWTYPE;
BEGIN
  -- Auto-register on first hit so callers don't need pre-seed
  PERFORM register_circuit_breaker(p_api_name);
  UPDATE api_circuit_breakers
     SET failure_count   = failure_count + 1,
         last_failure_at = now(),
         state           = CASE WHEN failure_count + 1 >= threshold THEN 'open' ELSE state END,
         open_until      = CASE WHEN failure_count + 1 >= threshold
                                THEN now() + (reset_timeout_seconds || ' seconds')::interval
                                ELSE open_until END,
         updated_at      = now()
   WHERE api_name = p_api_name
   RETURNING * INTO v_row;
  RETURN to_jsonb(v_row) || jsonb_build_object('last_error', left(coalesce(p_error,''), 500));
END;
$$;

CREATE OR REPLACE FUNCTION circuit_breaker_record_success(p_api_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM register_circuit_breaker(p_api_name);
  UPDATE api_circuit_breakers
     SET success_count   = success_count + 1,
         last_success_at = now(),
         failure_count   = 0,
         state           = 'closed',
         open_until      = NULL,
         updated_at      = now()
   WHERE api_name = p_api_name;
END;
$$;

CREATE OR REPLACE FUNCTION circuit_breaker_check(p_api_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_state text;
  v_open_until timestamptz;
BEGIN
  SELECT state, open_until INTO v_state, v_open_until
    FROM api_circuit_breakers WHERE api_name = p_api_name;

  IF v_state IS NULL THEN RETURN true; END IF;       -- not registered = pass
  IF v_state <> 'open' THEN RETURN true; END IF;     -- closed/half-open = pass
  IF v_open_until IS NULL OR v_open_until < now() THEN
    RETURN true;                                     -- timeout elapsed → caller may attempt
  END IF;
  RETURN false;                                      -- still open
END;
$$;

GRANT EXECUTE ON FUNCTION circuit_breaker_record_failure(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION circuit_breaker_record_success(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION circuit_breaker_check(text)                TO authenticated, service_role, anon;

-- Pre-seed internal RPCs we want monitored (3 strikes, 60s reset)
SELECT register_circuit_breaker('rpc.find_venue_duplicate_candidates',  3, 60);
SELECT register_circuit_breaker('rpc.find_event_duplicate_candidates',  3, 60);
SELECT register_circuit_breaker('rpc.find_hotel_duplicate_candidates',  3, 60);
SELECT register_circuit_breaker('rpc.find_city_duplicate_candidates',   3, 60);
SELECT register_circuit_breaker('rpc.find_country_duplicate_candidates',3, 60);
SELECT register_circuit_breaker('rpc.commit_venue_staging_batch',       3, 90);
SELECT register_circuit_breaker('rpc.commit_event_staging_batch',       3, 90);
SELECT register_circuit_breaker('rpc.commit_city_staging_batch',        3, 90);
SELECT register_circuit_breaker('rpc.commit_country_staging_batch',     3, 90);
SELECT register_circuit_breaker('rpc.commit_personality_staging_batch', 3, 90);
SELECT register_circuit_breaker('rpc.news_commit_staging_batch',        3, 90);
SELECT register_circuit_breaker('rpc.apply_enrichment',                 5, 60);
SELECT register_circuit_breaker('llm.openai.enrich-news',               5, 120);
SELECT register_circuit_breaker('llm.openai.enrich-venue',              5, 120);

COMMIT;
