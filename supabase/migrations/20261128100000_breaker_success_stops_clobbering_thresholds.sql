-- A SUCCESSFUL call was silently resetting a breaker's tuned thresholds.
--
-- `circuit_breaker_record_success(p_api_name)` begins with
--   PERFORM register_circuit_breaker(p_api_name);
-- to auto-register an unknown breaker. But `register_circuit_breaker` takes
-- `p_threshold DEFAULT 5, p_reset_seconds DEFAULT 120` and its ON CONFLICT
-- branch is DO UPDATE SET threshold = EXCLUDED.threshold,
-- reset_timeout_seconds = EXCLUDED.reset_timeout_seconds.
--
-- So that auto-register is not "insert if absent" — it is "insert, or overwrite
-- whatever tuning you configured with the defaults".
--
-- MEASURED: `llm.nvidia` was seeded threshold 3 / reset 900 by migration
-- 20261101100000 and verified at those values immediately after. Three days
-- later it read 5/120 with `updated_at` equal to `last_success_at` — the reset
-- was performed by a SUCCESS, which is the least suspicious event there is.
-- The 900s was chosen so an exhausted free tier is not re-probed every couple
-- of minutes; 120s quietly undid that.
--
-- Only the SUCCESS path does this. `circuit_breaker_record_failure` does not
-- call register at all (verified against the live definition, not the repo
-- file — the two have drifted). That asymmetry is why it hid: the failure path
-- is the one anybody would think to audit.
--
-- It also does not affect every breaker — 41 of 45 rows still carry non-default
-- thresholds — because `_shared/circuit-breaker.ts` writes the table directly
-- and calls `increment_circuit_breaker_success` instead. Only callers using the
-- `circuit_breaker_record_*` RPCs lose their tuning, which is the path
-- `_shared/llm-router.ts` takes because it deliberately avoids supabase-js.
--
-- FIX: auto-registration becomes insert-if-absent. Explicit tuning keeps its
-- overwrite semantics — `register_circuit_breaker(name, threshold, reset)` is
-- unchanged, because a caller passing values means them.

CREATE OR REPLACE FUNCTION public.register_circuit_breaker_if_absent(p_api_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
  VALUES (p_api_name, 'closed', 5, 120)
  ON CONFLICT (api_name) DO NOTHING;
$$;

COMMENT ON FUNCTION public.register_circuit_breaker_if_absent(text) IS
  'Auto-registration for circuit_breaker_record_success. Unlike register_circuit_breaker it NEVER overwrites an existing row: a success must not discard thresholds someone chose on purpose.';

REVOKE ALL ON FUNCTION public.register_circuit_breaker_if_absent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_circuit_breaker_if_absent(text) TO authenticated, service_role;

-- Body is otherwise byte-identical to the live definition; only the PERFORM
-- target changes. `circuit_breaker_record_failure` is deliberately NOT touched.
CREATE OR REPLACE FUNCTION public.circuit_breaker_record_success(p_api_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM register_circuit_breaker_if_absent(p_api_name);
  UPDATE api_circuit_breakers
     SET success_count = success_count + 1, last_success_at = now(),
         failure_count = 0, state = 'closed', open_until = NULL, updated_at = now()
   WHERE api_name = p_api_name;
END;
$$;

REVOKE ALL ON FUNCTION public.circuit_breaker_record_success(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.circuit_breaker_record_success(text) TO authenticated, service_role;

-- Restore what 20261101100000 intended. Explicit args, so the overwrite branch
-- is the correct one here.
SELECT public.register_circuit_breaker('llm.nvidia', 3, 900);
