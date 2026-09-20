-- ============================================================================
-- i18n dispatch: make a rejected translation request VISIBLE
-- ----------------------------------------------------------------------------
-- `run_i18n_translation_dispatch` fires net.http_post and throws the request id
-- away. Nothing ever looked at the response, so a target that the edge function
-- REJECTS was indistinguishable from one it served: `last_run_at` advanced,
-- the cron returned the loop count, and pg_cron recorded `succeeded`.
--
-- Measured on prod 2026-09-19, that hid a total outage of four locales:
-- translate-i18n-batch's ALLOWED_LOCALES still held the pipeline's FIRST list
-- (de fr es it pt nl pl ru tr uk sv) while this dispatcher seeded the
-- frontend's (de fr es it pt ru zh ja ko ar). zh/ja/ko/ar 400'd on EVERY fire
-- --- 60 of 150 targets, 40% of every slot burned --- for as long as the
-- dispatcher has existed. Coverage: 12k-16k rows per European locale against
-- 250-1,100 for the four, and 0 venue descriptions in any of them. The cron
-- reported success 5,562 times out of 5,562.
--
-- This is the `would_merge: 0` class: an engine with a work list it cannot
-- reach is indistinguishable from a healthy engine unless something reads the
-- ANSWER. The allowlist itself is fixed in the edge function; this migration
-- fixes the blindness, so the next drift is loud instead of silent.
--
-- Design notes that are load-bearing:
--
--  (a) Responses are resolved BY REQUEST ID and never by recency or URL.
--      net._http_response is shared by every caller on the instance and has no
--      url column at all; a "newest row" reaper has already mis-read one
--      function's response as another's in this project.
--
--  (b) A pg_net `timed_out` response is PARTIAL, not an error. It means pg_net
--      gave up client-side while the edge function kept running --- absence of
--      evidence, not evidence of failure. It never touches the counter.
--
--  (c) A 4xx is a CONTRACT bug (bad locale, bad table, bad field). It can never
--      be transient, so the health script hard-fails on one rather than waiting
--      for a threshold. 5xx and network errors accumulate instead.
--
--  (d) Nothing here auto-pauses. Auto-pause is a one-way door that deletes its
--      own evidence, and this project has been taken down by it three times.
--      A failing target stays scheduled and stays loud.
--
--  (e) net._http_response retention is ~6h measured, so the reaper's */5 is
--      load-bearing --- a stalled reaper loses the evidence permanently.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Outcome columns on the existing registry. No new table: the target row is
--    the natural home for "what happened the last time this fired".
-- ---------------------------------------------------------------------------
ALTER TABLE public.i18n_translation_targets
  ADD COLUMN IF NOT EXISTS last_request_id      bigint,
  ADD COLUMN IF NOT EXISTS last_status          int,
  ADD COLUMN IF NOT EXISTS last_error           text,
  ADD COLUMN IF NOT EXISTS last_success_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_resolved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.i18n_translation_targets.last_request_id IS
  'pg_net request id of the most recent dispatch, NULL once resolved by run_i18n_translation_reap. Resolve BY THIS ID, never by recency — net._http_response is shared instance-wide and has no url column.';
COMMENT ON COLUMN public.i18n_translation_targets.last_status IS
  'HTTP status of the last resolved dispatch. NULL = never resolved (or the response aged out of pg_net''s ~6h retention).';
COMMENT ON COLUMN public.i18n_translation_targets.consecutive_failures IS
  'Terminal failures since the last success. A pg_net timeout is partial and never increments this.';

-- Only unresolved rows are ever scanned by the reaper.
CREATE INDEX IF NOT EXISTS i18n_translation_targets_open_request_idx
  ON public.i18n_translation_targets (last_request_id)
  WHERE last_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Dispatcher: keep the request id.
--    Body and auth are unchanged — this is the same post, now with a receipt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_i18n_translation_dispatch(p_slots integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target record;
  v_count  int := 0;
  v_secret text;
  v_body   jsonb;
  v_req_id bigint;
  v_anon   text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'run_i18n_translation_dispatch: internal_invoke_secret missing, skipping';
    RETURN 0;
  END IF;

  -- The anon key is public (it ships in the frontend bundle); it is sent only
  -- so the gateway lets the request through whether verify_jwt is on or off.
  -- Real auth is X-Internal-Secret, checked inside the function.
  SELECT decrypted_secret INTO v_anon
  FROM vault.decrypted_secrets WHERE name = 'anon_key';
  v_anon := coalesce(
    v_anon,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'
  );

  FOR v_target IN
    SELECT * FROM i18n_translation_targets
    WHERE enabled
    ORDER BY last_run_at NULLS FIRST, priority, table_name, field, locale
    LIMIT greatest(coalesce(p_slots, 5), 0)
  LOOP
    v_body := jsonb_build_object(
      'table',       v_target.table_name,
      'locale',      v_target.locale,
      'field',       v_target.field,
      'batch_limit', v_target.batch_limit
    );
    IF v_target.min_quality IS NOT NULL THEN
      v_body := v_body || jsonb_build_object('min_quality', v_target.min_quality);
    END IF;

    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/translate-i18n-batch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'X-Internal-Secret', v_secret
      ),
      body := v_body,
      timeout_milliseconds := 30000
    ) INTO v_req_id;

    UPDATE i18n_translation_targets
       SET last_run_at     = now(),
           last_request_id = v_req_id,
           -- The previous outcome is stale the moment we re-fire. Clearing it
           -- keeps "unresolved" distinguishable from "resolved and fine".
           last_status     = NULL
     WHERE id = v_target.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Reaper: resolve open request ids against net._http_response.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_i18n_translation_reap()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok        int := 0;
  v_client    int := 0;   -- 4xx: a contract bug, never transient
  v_server    int := 0;   -- 5xx / network: accumulates toward a real alarm
  v_partial   int := 0;   -- pg_net gave up client-side; NOT a failure
  v_unresolved int := 0;  -- still in flight, or aged out of pg_net retention
BEGIN
  -- Success. Reset the counter and stamp the success.
  WITH resolved AS (
    SELECT t.id, r.status_code
    FROM i18n_translation_targets t
    JOIN net._http_response r ON r.id = t.last_request_id   -- BY REQUEST ID
    WHERE t.last_request_id IS NOT NULL
      AND coalesce(r.timed_out, false) = false
      AND r.status_code BETWEEN 200 AND 299
  ), upd AS (
    UPDATE i18n_translation_targets t
       SET last_status          = resolved.status_code,
           last_error           = NULL,
           last_success_at      = now(),
           last_resolved_at     = now(),
           consecutive_failures = 0,
           last_request_id      = NULL
      FROM resolved WHERE t.id = resolved.id
    RETURNING 1
  ) SELECT count(*) INTO v_ok FROM upd;

  -- Terminal failure: a real HTTP answer that is not 2xx. The response body is
  -- kept because it is the only place the REASON survives — the edge function
  -- spells out `locale must be one of: ...`, which is what would have named
  -- this defect on day one.
  WITH resolved AS (
    SELECT t.id, r.status_code,
           left(coalesce(r.error_msg, r.content, ''), 500) AS msg
    FROM i18n_translation_targets t
    JOIN net._http_response r ON r.id = t.last_request_id
    WHERE t.last_request_id IS NOT NULL
      AND coalesce(r.timed_out, false) = false
      AND (r.status_code IS NULL OR r.status_code NOT BETWEEN 200 AND 299)
  ), upd AS (
    UPDATE i18n_translation_targets t
       SET last_status          = resolved.status_code,
           last_error           = resolved.msg,
           last_resolved_at     = now(),
           consecutive_failures = t.consecutive_failures + 1,
           last_request_id      = NULL
      FROM resolved WHERE t.id = resolved.id
    RETURNING resolved.status_code
  )
  SELECT count(*) FILTER (WHERE status_code BETWEEN 400 AND 499),
         count(*) FILTER (WHERE status_code IS NULL OR status_code NOT BETWEEN 400 AND 499)
    INTO v_client, v_server
  FROM upd;

  -- Partial: pg_net timed out client-side. The edge function may well have
  -- finished the work. Record it, never count it.
  WITH resolved AS (
    SELECT t.id FROM i18n_translation_targets t
    JOIN net._http_response r ON r.id = t.last_request_id
    WHERE t.last_request_id IS NOT NULL AND coalesce(r.timed_out, false) = true
  ), upd AS (
    UPDATE i18n_translation_targets t
       SET last_status      = NULL,
           last_error       = 'pg_net timed_out (partial — not counted as a failure)',
           last_resolved_at = now(),
           last_request_id  = NULL
      FROM resolved WHERE t.id = resolved.id
    RETURNING 1
  ) SELECT count(*) INTO v_partial FROM upd;

  SELECT count(*) INTO v_unresolved
  FROM i18n_translation_targets WHERE last_request_id IS NOT NULL;

  RETURN jsonb_build_object(
    'ok', v_ok, 'client_error', v_client, 'server_error', v_server,
    'partial', v_partial, 'still_open', v_unresolved
  );
END $function$;

REVOKE ALL ON FUNCTION public.run_i18n_translation_reap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_i18n_translation_reap() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Sentinel. Standalone, service_role only.
--    `probe_ok` and `targets_total` are reported SEPARATELY from the failure
--    counts, because an empty table, a revoked grant and a healthy pipeline
--    otherwise all return the same reassuring zero.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.i18n_dispatch_signals()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'probe_ok', true,
    'targets_total',   (SELECT count(*) FROM i18n_translation_targets),
    'targets_enabled', (SELECT count(*) FROM i18n_translation_targets WHERE enabled),
    -- A 4xx is a contract bug and can never be transient: one is enough.
    'client_error_targets', (
      SELECT count(*) FROM i18n_translation_targets
      WHERE enabled AND last_status BETWEEN 400 AND 499
    ),
    'client_error_sample', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'target', table_name || '.' || field || '/' || locale,
               'status', last_status, 'error', left(coalesce(last_error,''), 160))), '[]'::jsonb)
      FROM (SELECT * FROM i18n_translation_targets
            WHERE enabled AND last_status BETWEEN 400 AND 499
            ORDER BY table_name, field, locale LIMIT 8) s
    ),
    'failing_targets', (
      SELECT count(*) FROM i18n_translation_targets
      WHERE enabled AND consecutive_failures >= 3
    ),
    -- Resolved at least once and NEVER once successfully — the exact shape the
    -- zh/ja/ko/ar outage had. Gated on `last_resolved_at IS NOT NULL` rather
    -- than on `last_run_at`, and the distinction is the whole point: these
    -- columns are new, so every one of the 150 targets has a NULL
    -- `last_success_at` the moment this migration applies. Keying on
    -- last_run_at reported 150 on the dry run — a sentinel that ships red on
    -- arrival is one people learn to scroll past. This reads 0 until the
    -- reaper has actually resolved an answer, and only then means anything.
    'never_succeeded', (
      SELECT count(*) FROM i18n_translation_targets
      WHERE enabled AND last_resolved_at IS NOT NULL AND last_success_at IS NULL
    ),
    'unresolved', (
      SELECT count(*) FROM i18n_translation_targets WHERE last_request_id IS NOT NULL
    ),
    'locales', (
      SELECT coalesce(jsonb_agg(DISTINCT locale ORDER BY locale), '[]'::jsonb)
      FROM i18n_translation_targets WHERE enabled
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.i18n_dispatch_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.i18n_dispatch_signals() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Schedule the reaper, and register it. The registry is the record; a cron
--    with no row there is "unregistered" and the sweeps report it forever.
--    Offset from the */2 dispatcher so the two rarely collide on the same row.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'i18n_translation_reap',
  'i18n translation reaper',
  'Every 5 min, resolves open pg_net request ids from run_i18n_translation_dispatch against net._http_response BY REQUEST ID and records the outcome on i18n_translation_targets. Exists because the dispatcher used to discard the response: four locales 400''d on every fire for months while the cron reported success. pg_net retention is ~6h, so the */5 is load-bearing.',
  'system', true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"sql","jobname":"i18n_translation_reap","function":"run_i18n_translation_reap"}'::jsonb,
  '1-59/5 * * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET enabled = true, schedule = EXCLUDED.schedule, action = EXCLUDED.action,
      description = EXCLUDED.description, updated_at = now();

SELECT cron.unschedule('i18n_translation_reap')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'i18n_translation_reap');

SELECT cron.schedule(
  'i18n_translation_reap', '1-59/5 * * * *',
  $cron$SELECT public.run_i18n_translation_reap();$cron$
);

-- ---------------------------------------------------------------------------
-- Postconditions. Assert the state this file exists to REACH, not the number
-- of rows it happened to touch — a count-what-I-did check passes vacuously on
-- a re-run and says nothing about whether the end state is right.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_missing text;
  v_sig     jsonb;
  v_jobs    int;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['last_request_id','last_status','last_error',
                    'last_success_at','last_resolved_at','consecutive_failures']) c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='i18n_translation_targets' AND column_name=c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'i18n_translation_targets is missing outcome columns: %', v_missing;
  END IF;

  -- The dispatcher must actually keep the id. Guarding on the assignment, not
  -- on the mere presence of the column name somewhere in the body.
  IF position('last_request_id = v_req_id' in
       pg_get_functiondef('public.run_i18n_translation_dispatch(integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'run_i18n_translation_dispatch does not record the pg_net request id';
  END IF;

  -- And the reaper must join on it. A reaper that resolved by recency would
  -- silently attribute another caller's response to a translation target.
  IF position('r.id = t.last_request_id' in
       pg_get_functiondef('public.run_i18n_translation_reap()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'run_i18n_translation_reap must join net._http_response BY REQUEST ID';
  END IF;

  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'i18n_translation_reap' AND active;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 active i18n_translation_reap cron job, found %', v_jobs;
  END IF;

  -- The probe must RUN, not merely exist.
  SELECT public.i18n_dispatch_signals() INTO v_sig;
  IF coalesce((v_sig->>'probe_ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'i18n_dispatch_signals() did not return probe_ok';
  END IF;
  IF (v_sig->>'targets_enabled')::int = 0 THEN
    RAISE EXCEPTION 'i18n_dispatch_signals() reports zero enabled targets — the registry is empty';
  END IF;

  RAISE NOTICE 'i18n dispatch observability: % enabled targets, locales %',
    v_sig->>'targets_enabled', v_sig->>'locales';
END $verify$;
