-- Add increment_circuit_breaker_success RPC used by _shared/circuit-breaker.ts#recordSuccess.
--
-- Without this RPC the fallback path in the old circuit-breaker code hit a thenable-vs-Promise
-- bug (supabase-js v2 rpc() returns a PostgrestBuilder which has no .catch), and every successful
-- source-* API call was mis-recorded as a failure. The circuit-breaker shared code has been fixed
-- to guard the call properly, but having the RPC present keeps success_count accurate as well.

CREATE OR REPLACE FUNCTION public.increment_circuit_breaker_success(p_api_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE api_circuit_breakers
  SET success_count = COALESCE(success_count, 0) + 1,
      updated_at = now()
  WHERE api_name = p_api_name;
$$;

GRANT EXECUTE ON FUNCTION public.increment_circuit_breaker_success(text) TO service_role, authenticated;
