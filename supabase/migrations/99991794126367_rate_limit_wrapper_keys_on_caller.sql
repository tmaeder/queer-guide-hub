-- A signed-in user could spend anyone's rate-limit quota.
--
-- public.check_rate_limit_enhanced is EXECUTE-able by `authenticated` because
-- two client-side checks call it (EnhancedContentValidator and
-- useSecurityValidation, whose own comment says the identifier "will be
-- replaced with user ID server-side"). Nothing replaced it: the wrapper passed
-- the caller's `identifier` straight through. The same table also holds the
-- server-side donation checkout limit, keyed `<client ip>_checkout_session`
-- by create-checkout-session (service role). So any signed-in user could call
--
--   check_rate_limit_enhanced('<someone's ip>', 1000, 60, 'checkout_session')
--
-- ten times and lock that address out of donating for an hour, or write
-- arbitrary keys into the table.
--
-- Fix: when the caller is `authenticated`, the key is forced to their own
-- user id. A user can still count their own actions (what both client callers
-- want) and nothing else; 'user:<uuid>' can never equal an IP-keyed row or
-- another user's row. Service-role callers (create-checkout-session) keep
-- choosing the identifier, as before. The wrapper stays a plain SQL function
-- (SECURITY INVOKER), so current_user is the calling role, and CREATE OR
-- REPLACE keeps its existing grants.

CREATE OR REPLACE FUNCTION public.check_rate_limit_enhanced(
  identifier text,
  max_attempts integer DEFAULT 10,
  time_window_minutes integer DEFAULT 60,
  action_type text DEFAULT 'general'::text
)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT api_private.check_rate_limit_enhanced(
    identifier => CASE
      WHEN current_user = 'authenticated'
        THEN 'user:' || COALESCE(auth.uid()::text, 'unknown')
      ELSE $1
    END,
    max_attempts => $2,
    time_window_minutes => $3,
    action_type => $4
  )
$function$;

-- Behavioural check, rolled back: call the wrapper AS a signed-in user who
-- names someone else's key, and confirm only the caller's own key was written.
DO $verify$
DECLARE
  probe_uid constant uuid := '00000000-0000-4000-8000-0000000c0ffe';
  victim constant text := '198.51.100.77';
  own_rows integer;
  victim_rows integer;
  allowed boolean;
  -- Not RESET ROLE: under `supabase db push` the session logs in as a
  -- temporary login role and then switches to postgres, so RESET ROLE lands
  -- on that login role, which cannot read public tables (it failed the first
  -- push with 42501 permission denied for schema public). Switch back to the
  -- role this block started as instead.
  prior_role constant text := current_user;
BEGIN
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', probe_uid, 'role', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    allowed := public.check_rate_limit_enhanced(victim, 5, 60, 'zz_probe');
    EXECUTE format('SET LOCAL ROLE %I', prior_role);

    SELECT count(*) INTO own_rows FROM public.auth_rate_limit_keys
     WHERE key = 'user:' || probe_uid || '_zz_probe';
    SELECT count(*) INTO victim_rows FROM public.auth_rate_limit_keys
     WHERE key = victim || '_zz_probe';
    RAISE EXCEPTION 'rollback-probe' USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN
    NULL;
  END;

  IF allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'rate limit wrapper: first call as authenticated was not allowed (%)', allowed;
  END IF;
  IF own_rows <> 1 THEN
    RAISE EXCEPTION 'rate limit wrapper: caller key not written (% rows)', own_rows;
  END IF;
  IF victim_rows <> 0 THEN
    RAISE EXCEPTION 'rate limit wrapper: authenticated caller still wrote the key it named';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_rate_limit_keys WHERE key LIKE '%_zz_probe') THEN
    RAISE EXCEPTION 'rate limit wrapper: probe row was not rolled back';
  END IF;
END
$verify$;
