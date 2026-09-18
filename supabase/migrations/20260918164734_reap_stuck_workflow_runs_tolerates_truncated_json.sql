-- One truncated HTTP response body took the ENTIRE ingest fleet down for 36 hours, and every
-- health counter stayed green throughout.
--
-- ============================================================================
-- THE CHAIN, MEASURED ON PROD 2026-09-18
-- ============================================================================
-- 1. `reap_stuck_workflow_runs()` copies a completed direct-invoke response body into
--    `workflow_runs.output_result`. It guarded the cast with
--        left(ltrim(coalesce(resp.content,'')), 1) in ('{','[')
--    which tests the FIRST CHARACTER ONLY. A body that legitimately starts with `[` but is
--    TRUNCATED mid-token passes that guard and then raises on `::jsonb`. The live one:
--        ERROR: invalid input syntax for type json
--        DETAIL: Token ""8ad04290-f646-423" is invalid.
--        CONTEXT: JSON data, line 1: ...tatus":"partial"},{"entity_id":"8ad04290-f646-423
--    A first-character test is not a validity test.
--
-- 2. The function had succeeded 662 times (through 2026-09-17 00:35) and then failed 43 times
--    consecutively (01:35 -> 05:05). `auto_pause_threshold = 3` set `enabled = false`, and the
--    nightly `automation_cron_sync` at 05:10 unscheduled it. It has no `cron.job` row today.
--
-- 3. `reap_stuck_workflow_runs` is the ONLY thing that clears stale `workflow_runs.status
--    = 'running'`. With it dead, that count only ever grows: 225 rows, oldest 2026-09-17 01:30,
--    and the newest `completed` run anywhere is 2026-09-17 04:19.
--
-- 4. `workflow-dispatcher` refuses to dispatch above a max-concurrency ceiling. From 2026-09-17
--    it has answered every single minute with
--        HTTP 200 {"success":true,"message":"Max concurrency reached, skipping dispatch",
--                  "running":225}
--    `running` climbing 210 -> 225 over the afternoon this was measured.
--
-- 5. THE FALSE GREEN IS THE POINT. That response is a 200 with `success: true`, so pg_net records
--    a success, `admin_automation_reap_runs` books it a success, `consecutive_failures` stays 0
--    and auto-pause can never fire on the dispatcher. `workflow_dispatcher_1min` reads
--    enabled/success/0-failures while dispatching NOTHING.
--
-- 6. Downstream, `pgmq.q_pipeline_steps` held 174 messages with **read_ct = 0 and visible** —
--    never read even once — the oldest 36.6 hours old. Every DAG stalled with its nodes pending
--    and `reap_stuck_pipeline_runs` marked the runs `failed` with
--    "reaped: running > 1800 s without heartbeat". Eight pipelines were alerting at once:
--    news, events, venue, hotel, marketplace, personality, social-media, city.
--
-- `reap_stuck_pipeline_runs` was REPORTING the outage, not causing it — the same reading error
-- CLAUDE.md records for 2026-08-25. What is new here is that the auto-paused victim was the
-- *workflow* reaper, so the outage surfaced as a concurrency ceiling rather than a dead stepper.
--
-- ============================================================================
-- THE FIX
-- ============================================================================
-- `pg_input_is_valid(text, 'jsonb')` (PostgreSQL 16+; this instance is 17.6) answers the question
-- the old guard was trying to ask, set-based and without a per-row exception subtransaction.
-- Verified on this instance before writing this file:
--     pg_input_is_valid('[{"a":1}]', 'jsonb')                        -> true
--     pg_input_is_valid('[{"status":"partial"},{"entity_id":"8ad0', 'jsonb') -> false
--
-- NOTHING ELSE IN THE FUNCTION CHANGES. The two reap branches and the return value are byte-for-
-- byte the previous definition; only the `output_result` guard moves. A truncated body now yields
-- a NULL `output_result` — which is what the guard always intended for an unparseable body — and
-- the run is still reconciled instead of the whole statement aborting.
--
-- The automation row is re-enabled here. Re-enabling is sufficient for THIS row specifically
-- because it is `action->>'type' = 'cron'` and carries `action.command`
-- (`SELECT public.reap_stuck_workflow_runs();`), so `sync_automations_to_cron()` branch (d) can
-- recreate the missing `cron.job`. That is NOT true of an `rpc` row, which carries no command and
-- must be rescheduled by its own migration — checked here rather than assumed.
--
-- `consecutive_failures` is reset so the row does not re-pause on the next transient error while
-- still carrying 43 historical failures in `admin_automation_runs`.
--
-- The 225 stale rows are deliberately NOT cleared by this migration: that is the repaired
-- function's own job, and running it is what proves the repair on live data.
--
-- REVERSE
--   the previous definition is in this file's git history; `enabled` was false and
--   `consecutive_failures` 43 before this ran.

create or replace function public.reap_stuck_workflow_runs()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_count INT;
  v_reconciled INT;
BEGIN
  WITH matched AS (
    UPDATE public.workflow_runs r
    SET status = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN 'completed' ELSE 'failed' END,
        error_message = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN r.error_message
                             ELSE format('direct invoke HTTP %s', COALESCE(resp.status_code::text, resp.error_msg, 'error')) END,
        -- A first-character test is not a validity test: a truncated body starting with `[`
        -- passed the old guard and then raised on the cast, aborting the whole statement.
        output_result = CASE WHEN resp.status_code BETWEEN 200 AND 299
                             THEN CASE WHEN pg_input_is_valid(COALESCE(resp.content,''), 'jsonb')
                                       THEN resp.content::jsonb ELSE NULL END
                             ELSE r.output_result END,
        completed_at = now(),
        duration_ms = (EXTRACT(EPOCH FROM (now() - r.started_at)) * 1000)::int,
        updated_at = now()
    FROM net._http_response resp
    WHERE r.status = 'running'
      AND r.queue_name = 'direct'
      AND r.invoke_request_id = resp.id
      AND (resp.status_code IS NOT NULL OR resp.error_msg IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*) INTO v_reconciled FROM matched;

  WITH reaped AS (
    UPDATE public.workflow_runs r
    SET status = 'failed',
        error_message = COALESCE(
          r.error_message,
          format('reaped: workflow_run running > %s s without completion',
                 COALESCE(d.timeout_seconds, 600))
        ),
        completed_at = now()
    FROM public.workflow_definitions d
    WHERE r.definition_id = d.id
      AND r.status = 'running'
      AND r.started_at IS NOT NULL
      AND r.started_at < now()
          - make_interval(secs => COALESCE(d.timeout_seconds, 600) * 2)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reaped;

  WITH reaped AS (
    UPDATE public.workflow_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'reaped: orphan workflow_run running > 30min'),
        completed_at = now()
    WHERE status = 'running'
      AND definition_id IS NULL
      AND started_at IS NOT NULL
      AND started_at < now() - INTERVAL '30 minutes'
    RETURNING 1
  )
  SELECT v_count + count(*) INTO v_count FROM reaped;

  RETURN v_reconciled + v_count;
END;
$function$;

do $verify$
declare
  v_src text;
  v_kind text;
  v_has_command boolean;
  v_enabled boolean;
begin
  -- Re-enable only if the row can actually be rescheduled from the registry. An `rpc` row carries
  -- no `action.command`, so sync_automations_to_cron() structurally cannot recreate its job and
  -- re-enabling would leave it on-but-unscheduled, which reads healthy and is not.
  select a.action->>'type', (a.action->>'command') is not null
    into v_kind, v_has_command
    from public.admin_automations a
   where a.slug = 'reap_stuck_workflow_runs';

  if v_kind is null then
    raise exception 'reap_stuck_workflow_runs has no admin_automations row';
  end if;
  if v_kind <> 'cron' or not v_has_command then
    raise exception 'reap_stuck_workflow_runs is % with command=% — reschedule it from a migration, do not just enable it',
      v_kind, v_has_command;
  end if;

  update public.admin_automations
     set enabled = true,
         consecutive_failures = 0,
         last_run_status = 'pending'
   where slug = 'reap_stuck_workflow_runs';

  -- Postconditions: the guard is gone from the live definition, and the row is enabled.
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reap_stuck_workflow_runs';

  if position('pg_input_is_valid' in v_src) = 0 then
    raise exception 'the repaired json guard is not in the live definition';
  end if;
  if position($n$left(ltrim(COALESCE(resp.content,'')), 1)$n$ in v_src) > 0 then
    raise exception 'the first-character guard survived — a truncated body still aborts the reap';
  end if;

  select enabled into v_enabled from public.admin_automations where slug = 'reap_stuck_workflow_runs';
  if not v_enabled then
    raise exception 'reap_stuck_workflow_runs is still disabled';
  end if;

  raise notice 'reap_stuck_workflow_runs repaired and re-enabled';
end $verify$;
