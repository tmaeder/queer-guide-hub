-- A GATEWAY GIVE-UP IS NOT EVIDENCE THE JOB FAILED.
--
-- `admin_automation_reap_runs()` already encodes the right rule for pg_net's
-- client-side timeout: the request was abandoned, the work very likely
-- completed, so it is `partial` and must never touch `consecutive_failures`.
-- Its own comment says why -- counting those would have auto-paused
-- `workflow_dispatcher_1min`, an every-minute core job, within three minutes.
--
-- The SAME evidence class arrives with a different shape and was being counted
-- as a real failure: the Supabase edge gateway gives up at 150s and answers
--     504 {"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s) reached"}
-- with `timed_out = false`, because from pg_net's point of view the request
-- completed -- it got an HTTP response. So it lands in `n_bad` (status >= 400)
-- and the run is recorded `error`, while the edge function is still executing
-- server-side and goes on to write its own `success` row moments later.
--
-- MEASURED ON PROD, 2026-09-04, `venue_accessibility_osm` (*/20):
--   03:40  504 IDLE_TIMEOUT   -> reaper wrote 'error'
--   04:00  504 IDLE_TIMEOUT   -> reaper wrote 'error'
--   04:20  200 processed 25, matched 3, applied 2
--   04:40  200 processed 25, matched 2, applied 0
-- Two paired rows exist for the 04:20/04:40 fires: the reaper's and the
-- function's own. For the 504 fires the function ALSO completed -- there is a
-- `success` row at 04:40:02 carrying the real summary -- so the `error` was
-- never a statement about the work, only about who was still listening.
--
-- That drove `consecutive_failures` to `auto_pause_threshold` and set
-- `enabled = false` on the highest-measured-impact enrichment engine on the
-- platform (venue accessibility, 52 of 26,905 venues populated). Auto-pause is
-- a one-way door whose success branch resets the counter, so a falsely-paused
-- row is indistinguishable from a deliberate retirement -- the trap CLAUDE.md
-- already documents three times over.
--
-- THE BLAST RADIUS IS DELIBERATE. This is fixed in the shared reaper, not in
-- one slug's bookkeeping, because every long-running edge function on the
-- 144-cron `net.http_post` path has exactly this defect. The sentinel written
-- after the second auto-pause incident was hardcoded to `slug=eq.search_reindex_drain`
-- while its own comment described the general mechanism; scoping this to
-- `venue_accessibility_osm` would repeat that mistake one layer down.
--
-- THE COST, STATED: a function that merely HANGS forever now reads `partial`
-- and never auto-pauses. That trade is already accepted for pg_net `timed_out`
-- and the mitigation already exists and is unchanged --
-- `admin_automation_tracking_gaps().unverifiable_automations` fires on >= 3 runs
-- in 24h that are all unverifiable. The per-job fix is likewise unchanged: make
-- the work fit the window, and a genuine hang becomes a countable failure.
--
-- THE TEST IS NARROW ON PURPOSE. `status_code = 504 AND content ILIKE '%IDLE_TIMEOUT%'`
-- -- a bare 504 is NOT matched, because a 504 relayed from a third-party
-- upstream is a real failure signal and must stay countable. Only the gateway's
-- own documented idle-timeout envelope is reclassified.

create or replace function public.admin_automation_reap_runs(p_grace_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  r             record;
  v_finalized   int := 0;
  v_failed      int := 0;
  v_noop        int := 0;
  v_abandoned   int := 0;
  v_still_open  int := 0;
BEGIN
  FOR r IN
    SELECT
      run.id,
      run.started_at,
      COUNT(req.request_id)                                        AS n_req,
      COUNT(resp.id)                                               AS n_resp,
      COALESCE(MAX(req.timeout_ms), 5000)                          AS max_timeout_ms,
      -- A real failure: the target answered and said no, or the transport
      -- broke in a way that is not a client-side give-up.
      --
      -- The gateway idle-timeout envelope is excluded here and counted as a
      -- timeout below. See this migration's header for the measurement.
      COUNT(*) FILTER (
        WHERE resp.id IS NOT NULL
          AND NOT COALESCE(resp.timed_out, false)
          AND (resp.status_code >= 400 OR resp.error_msg IS NOT NULL)
          AND NOT (resp.status_code = 504 AND COALESCE(resp.content, '') ILIKE '%IDLE_TIMEOUT%')
      )                                                            AS n_bad,
      -- NOT a failure: somebody gave up waiting while the work kept running.
      -- Two shapes, one meaning.
      --
      -- (a) pg_net gave up client-side (`timed_out`). Measured on the first
      --     live pass -- 2 of 41 requests, both jobs whose registered command
      --     omits timeout_milliseconds and so inherits pg_net's 5s default
      --     while the edge function keeps running server-side.
      -- (b) The Supabase edge GATEWAY gave up at 150s and returned a 504
      --     IDLE_TIMEOUT envelope. `timed_out` is false because pg_net did
      --     receive a response -- but the response says "nobody was listening
      --     any more", not "the work failed". Measured 2026-09-04 on
      --     venue_accessibility_osm, which auto-paused itself over it while
      --     writing its own success rows.
      --
      -- Both are the absence of evidence. Recording either as evidence of
      -- absence auto-pauses a healthy job.
      COUNT(*) FILTER (
        WHERE COALESCE(resp.timed_out, false)
           OR (resp.id IS NOT NULL
               AND resp.status_code = 504
               AND COALESCE(resp.content, '') ILIKE '%IDLE_TIMEOUT%')
      )                                                            AS n_timeout,
      jsonb_agg(
        jsonb_build_object(
          'request_id',  req.request_id,
          'url',         req.url,
          'status_code', resp.status_code,
          'timed_out',   resp.timed_out,
          'error',       resp.error_msg,
          'body',        left(resp.content, 500)
        ) ORDER BY req.request_id
      ) FILTER (WHERE req.request_id IS NOT NULL)                  AS detail
    FROM public.admin_automation_runs run
    LEFT JOIN public.admin_automation_run_requests req ON req.run_id = run.id
    -- Joined ON THE REQUEST ID. This is the whole point of the link table.
    LEFT JOIN net._http_response resp ON resp.id = req.request_id
    WHERE run.status = 'running'
    GROUP BY run.id, run.started_at
  LOOP
    -- No request issued, and the transaction that would have issued one has
    -- already committed (the run row's own survival proves that). Several
    -- commands post conditionally -- hotel_reenrich_stale has a WHERE EXISTS,
    -- news_verdict_geo_backfill an IF -- so this is a legitimate no-op, NOT a
    -- failure. Recording it as an error would auto-pause healthy jobs.
    IF r.n_req = 0 THEN
      IF r.started_at < now() - make_interval(secs => p_grace_seconds) THEN
        UPDATE public.admin_automation_runs
        SET status = 'success', finished_at = now(),
            summary = jsonb_build_object('no_request', true,
                                         'note', 'command committed without issuing an HTTP request')
        WHERE id = r.id;
        v_noop := v_noop + 1;
        v_finalized := v_finalized + 1;
      ELSE
        v_still_open := v_still_open + 1;
      END IF;

    ELSIF r.n_resp = r.n_req THEN
      -- Three-way, and the middle one is the whole point: 'partial' records
      -- the run and stamps last_run_at but does NOT touch
      -- consecutive_failures, so an unverifiable job stays visible without
      -- being auto-paused on absence of evidence. Fix the cause by making the
      -- work fit inside the gateway's 150s idle timeout (and raising the
      -- registered timeout_milliseconds above it, so the gateway's answer is
      -- actually received rather than pre-empted); then a genuine hang becomes
      -- a countable failure instead of an unknown.
      UPDATE public.admin_automation_runs
      SET status = CASE WHEN r.n_bad > 0 THEN 'error'
                        WHEN r.n_timeout > 0 THEN 'partial'
                        ELSE 'success' END,
          finished_at = now(),
          error = CASE WHEN r.n_bad > 0
                       THEN r.n_bad || ' of ' || r.n_req || ' request(s) failed'
                       WHEN r.n_timeout > 0
                       THEN r.n_timeout || ' of ' || r.n_req
                            || ' request(s) gave up waiting (pg_net client-side, or gateway 504 IDLE_TIMEOUT)'
                            || ' — outcome unknown, shorten the work or raise timeout_milliseconds'
                       ELSE NULL END,
          summary = jsonb_build_object('requests', r.detail)
                    || CASE WHEN r.n_bad = 0 AND r.n_timeout > 0
                            THEN jsonb_build_object('unverifiable', true) ELSE '{}'::jsonb END
      WHERE id = r.id;
      v_finalized := v_finalized + 1;
      IF r.n_bad > 0 THEN v_failed := v_failed + 1; END IF;

    -- Responses missing past the request's OWN timeout plus grace. pg_net
    -- normally writes a timed_out row of its own accord, so absence this late
    -- means the request vanished (worker restart) rather than that the target
    -- failed. Closed as 'partial', not 'error', for the same reason as the
    -- timeout branch: this is our bookkeeping losing the thread, and a job
    -- must not be auto-paused for pg_net's fault. It is still RECORDED and
    -- counted in the abandoned metric, which is the part no per-edge-function
    -- helper can do at all -- a function that never runs cannot report on
    -- itself.
    ELSIF r.started_at + make_interval(secs => (r.max_timeout_ms / 1000.0) + p_grace_seconds) < now() THEN
      UPDATE public.admin_automation_runs
      SET status = 'partial', finished_at = now(),
          error = 'no response recorded for ' || (r.n_req - r.n_resp) || ' of ' || r.n_req
                  || ' request(s) within timeout + grace — outcome unknown',
          summary = jsonb_build_object('requests', r.detail, 'abandoned', true, 'unverifiable', true)
      WHERE id = r.id;
      v_finalized := v_finalized + 1;
      v_abandoned := v_abandoned + 1;

    ELSE
      v_still_open := v_still_open + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'finalized', v_finalized, 'failed', v_failed, 'no_request', v_noop,
    'abandoned', v_abandoned, 'still_running', v_still_open
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DELIBERATELY NO LONGER DOES.
--
-- It was written to fix the reaper AND to bring `venue_accessibility_osm` back:
-- re-bracket its pg_net timeout to 180s and set `enabled = true`. While it sat
-- unmerged, `20270301100300_retire_venue_accessibility_osm_cron` landed on main
-- and retired that cron on measured evidence -- 916 probes, 81% no name match
-- within 60 m, 2.7% resolved, 72 fires/day of Overpass traffic -- superseding
-- the per-venue matcher with a bulk regional-extract join.
--
-- This migration now sorts ABOVE that one, so keeping the re-enable would have
-- silently reverted a deliberate decision made with better data than the one
-- that motivated the restore. Both statements and their three assertions are
-- removed. The row stays disabled and the timeout stays as the retirement left
-- it; the edge function is retained, per that migration, for the bulk rewrite.
--
-- The reaper fix above is INDEPENDENT of that and is why this migration still
-- exists: a gateway give-up is not evidence of failure for ANY of the ~144
-- automations on the net.http_post path, and misreading it is what burns the
-- auto-pause counter. venue_accessibility_osm was the example, not the scope.

-- ---------------------------------------------------------------------------
do $verify$
declare
  v_def    text;
  v_norm   text;
  v_nbad   text;
  v_ntime  text;
  v_row    record;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_automation_reap_runs';

  if v_def is null then
    raise exception 'admin_automation_reap_runs is missing after replace';
  end if;

  -- pg_get_functiondef returns the body VERBATIM as submitted -- casing,
  -- newlines and column alignment included. Matching against it raw makes the
  -- assertion fail on a pure reformat, so normalise whitespace first and match
  -- case-insensitively. (Verified against prod: the raw form matched only
  -- because this migration happens to write the filter in upper case.)
  v_norm := lower(regexp_replace(v_def, '\s+', ' ', 'g'));

  -- Isolate each filter so the two assertions cannot be satisfied by the other
  -- one's text. Without this split, `n_timeout`'s check would pass merely
  -- because the IDLE_TIMEOUT string appears anywhere in the function.
  v_nbad  := substring(v_norm from 'and \(resp\.status_code >= 400.*?\) as n_bad');
  v_ntime := substring(v_norm from 'count\(\*\) filter \( where coalesce\(resp\.timed_out.*?\) as n_timeout');

  if v_nbad is null or v_ntime is null then
    raise exception 'could not locate the n_bad / n_timeout filters — the reaper was restructured, re-verify by hand';
  end if;

  -- Both arms must be present. Either alone is a silent half-fix: excluding
  -- the envelope from n_bad WITHOUT counting it as a timeout would classify a
  -- gateway give-up as a SUCCESS, which is worse than the error it replaces.
  if v_nbad not like '%idle_timeout%' then
    raise exception 'n_bad does not exclude the gateway IDLE_TIMEOUT envelope';
  end if;
  if v_ntime not like '%idle_timeout%' then
    raise exception 'n_timeout does not include the gateway IDLE_TIMEOUT envelope';
  end if;

  -- A bare 504 must still be countable as a failure -- a 504 relayed from a
  -- third-party upstream is real. Guard against a future edit widening the
  -- test to every 504 by requiring the status test to stay conjoined with the
  -- body test in BOTH filters.
  if v_nbad  not like '%status_code = 504 and %' then
    raise exception 'the n_bad 504 test was widened beyond the IDLE_TIMEOUT envelope';
  end if;
  if v_ntime not like '%status_code = 504 and %' then
    raise exception 'the n_timeout 504 test was widened beyond the IDLE_TIMEOUT envelope';
  end if;

  -- Assert the retirement is INTACT, which is the inverse of what this block
  -- originally checked. 20270301100300 disabled this row on measured evidence;
  -- if a later edit to this migration re-arms it, fail here rather than
  -- resuming 72 Overpass fires a day for a 2.7% match rate.
  select enabled, consecutive_failures
  into v_row
  from public.admin_automations where slug = 'venue_accessibility_osm';

  if not found then
    raise exception 'venue_accessibility_osm registry row is missing';
  end if;
  if v_row.enabled then
    raise exception
      'venue_accessibility_osm is enabled; 20270301100300 retired it deliberately — do not re-arm it here';
  end if;

  raise notice 'gateway IDLE_TIMEOUT reclassified as partial for all net.http_post automations';
end
$verify$;
