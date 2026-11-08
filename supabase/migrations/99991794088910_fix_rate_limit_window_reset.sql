-- check_rate_limit_enhanced never reset its counter when a window expired.
--
-- The read only counts an attempt that is still inside the window
-- (`last_attempt > window_start`), but the upsert always did
-- `attempt_count = attempt_count + 1`. So once a key had accumulated
-- `max_attempts` calls IN TOTAL, however far apart, the first call after a
-- quiet window was allowed (the read saw nothing in-window) and pushed the
-- stale count past the limit, and every further call inside that window was
-- refused. An IP that had ever made `max_attempts` calls was held to about
-- one call per window for good.
--
-- Measured on prod before this change: 235 checkout_session keys, highest
-- attempt_count 3, none at the limit of 10, so nobody has been locked out yet.
-- It matters now because mapbox-geocoding is about to rate-limit its
-- autocomplete through this function; under the old body every regular user
-- would eventually be stuck at one lookup per window.
--
-- The upsert resets expired counters and atomically rejects attempts when
-- the current counter is at the limit. Same signature, same
-- SECURITY DEFINER / search_path, and CREATE OR REPLACE keeps the existing
-- grants, so the public wrapper public.check_rate_limit_enhanced (a thin SQL
-- function delegating here, from 20261021174528) needs no change.

CREATE OR REPLACE FUNCTION api_private.check_rate_limit_enhanced(
  identifier text,
  max_attempts integer DEFAULT 10,
  time_window_minutes integer DEFAULT 60,
  action_type text DEFAULT 'general'::text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_attempts integer;
  window_start timestamptz := now() - make_interval(mins => time_window_minutes);
  rate_key text := identifier || '_' || action_type;
BEGIN
  INSERT INTO public.auth_rate_limit_keys AS keys (key, attempt_count, last_attempt)
  VALUES (rate_key, 1, now())
  ON CONFLICT (key) DO UPDATE
  SET attempt_count = CASE
        WHEN keys.last_attempt > window_start THEN keys.attempt_count + 1
        ELSE 1
      END,
      last_attempt = EXCLUDED.last_attempt
  WHERE keys.last_attempt <= window_start OR keys.attempt_count < max_attempts;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  SELECT keys.attempt_count INTO current_attempts
  FROM public.auth_rate_limit_keys AS keys
  WHERE keys.key = rate_key;

  PERFORM public.log_enhanced_security_event(
    'RATE_LIMIT_EXCEEDED',
    auth.uid(),
    jsonb_build_object(
      'identifier', identifier,
      'action_type', action_type,
      'attempts', current_attempts,
      'max_attempts', max_attempts
    ),
    'high'
  );
  RETURN FALSE;
END;
$function$;

-- Behavioural check, rolled back: drive the real function through the exact
-- sequence the old body got wrong, inside a sub-block whose writes are undone
-- by the RAISE that ends it, then assert on the captured results.
DO $verify$
DECLARE
  probe constant text := 'zz_migration_probe_99991794088910';
  r1 boolean; r2 boolean; r3 boolean; r4 boolean; r5 boolean; r6 boolean;
BEGIN
  BEGIN
    r1 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe');
    r2 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe');
    r3 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe'); -- over the limit
    -- The window passes.
    UPDATE public.auth_rate_limit_keys
       SET last_attempt = NOW() - interval '2 hours'
     WHERE key = probe || '_probe';
    r4 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe'); -- new window
    r5 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe'); -- old body: refused
    r6 := api_private.check_rate_limit_enhanced(probe, 2, 60, 'probe'); -- over again
    RAISE EXCEPTION 'rollback-probe' USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN
    NULL; -- probe rows and any security events from it are rolled back
  END;

  IF NOT (r1 AND r2 AND NOT r3) THEN
    RAISE EXCEPTION 'rate limit: first window wrong (% % %)', r1, r2, r3;
  END IF;
  IF NOT (r4 AND r5) THEN
    RAISE EXCEPTION 'rate limit: an expired window did not reset the count (% %)', r4, r5;
  END IF;
  IF r6 THEN
    RAISE EXCEPTION 'rate limit: the new window does not enforce the limit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_rate_limit_keys WHERE key = probe || '_probe') THEN
    RAISE EXCEPTION 'rate limit: probe row was not rolled back';
  END IF;
END
$verify$;
