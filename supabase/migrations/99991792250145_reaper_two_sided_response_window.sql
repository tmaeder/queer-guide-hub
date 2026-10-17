-- The reaper's request->response window was open at the top, so a reused pg_net
-- id let an old request absorb a much later unrelated response.
--
-- `admin_automation_reap_runs` resolves a response BY REQUEST ID, which is right,
-- and already carries a lower bound added when the 2026-10-12 sequence reset was
-- found: `resp.created >= req.created_at` ("a response cannot predate its own
-- request"). That half is correct and is kept verbatim.
--
-- What it does not bound is how LATE a match may be. pg_net's id sequence has
-- reset -- live ids span ~838..4176 while admin_automation_run_requests holds ids
-- to 443,751 -- so ids are being REISSUED, and a request filed hours ago still
-- satisfies `resp.created >= req.created_at` for a brand-new response that merely
-- happens to carry the same id.
--
-- THE DOCUMENTED GUARANTEE THAT WOULD HAVE PREVENTED THIS DOES NOT EXIST.
-- CLAUDE.md states "request_id is the PRIMARY KEY of admin_automation_run_requests
-- -- the mistake is unspellable, not merely discouraged". The actual constraint is
--   PRIMARY KEY (run_id, request_id)
-- i.e. COMPOSITE. One request_id has always been filable against many runs; the
-- uniqueness the join leans on was never enforced. Measured on prod: 2,173
-- request_ids are each filed against 2 distinct runs, first seen 2026-10-12 18:40
-- and still growing (latest 2026-10-17 14:43). The doc is corrected in the same
-- change as this migration.
--
-- Measured harm, last 24h of (request, response) pairs that the CURRENT join
-- accepts:
--   pairs_total                 2306
--   pairs beyond timeout+grace    71   <- 3.1%
--   pairs beyond 30 minutes       71   <- the same 71, so none are marginal
--   worst lag              11:13:25
-- A real pg_net response cannot arrive 11 hours after its request; its timeouts
-- are seconds. Those 71 are reused-id false matches, and they are not inert --
-- they feed `n_bad` and `n_timeout`, which decide the run's status and therefore
-- `consecutive_failures`. A false success on a failing job resets the counter and
-- auto-pause can never fire; a false failure auto-pauses a healthy one.
--
-- Fix: bound the window on BOTH sides, using the request's OWN timeout plus the
-- same grace the abandoned branch already uses, so the two cannot disagree about
-- what "too late" means.
--
-- WHY THIS IS SAFE RATHER THAN A TRADE. The 71 excluded pairs are all >30 min
-- late, so no plausible real response is discarded -- and a request that now
-- matches nothing does not become an error: it falls through to the existing
-- `abandoned` branch, which closes the run 'partial' and explicitly does NOT
-- touch consecutive_failures. The failure direction is "unverifiable", which is
-- what this file's own header elsewhere insists on: absence of evidence must not
-- be recorded as evidence of absence.
--
-- It is also a NO-OP TODAY, asserted below: 0 currently-'running' runs match a
-- late response, because the reaper's */5 cadence closes runs long before an id
-- can be reused. This hardens a latent hole; it changes no live verdict.
--
-- The NULL-created_at fail-open is preserved exactly: rows filed before that
-- column existed keep their previous behaviour rather than flipping to
-- 'abandoned'.

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
      -- timeout below. See 20260816113041's header for the measurement.
      COUNT(*) FILTER (
        WHERE resp.id IS NOT NULL
          AND NOT COALESCE(resp.timed_out, false)
          AND (resp.status_code >= 400 OR resp.error_msg IS NOT NULL OR private.automation_response_failed(resp.content))
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
    -- Joined ON THE REQUEST ID. This is the whole point of the link table --
    -- but pg_net's id sequence has reset at least once (2026-10-12) and ids are
    -- being REISSUED, so the id alone is ambiguous: 2,173 request_ids are each
    -- filed against two runs. The id is exact only INSIDE a window, bounded on
    -- BOTH sides:
    --
    --   lower -- a response cannot predate its own request. Without it a run
    --            still 'running' from before a reset resolves against a fresh,
    --            unrelated response.
    --   upper -- a response cannot arrive after the request's own timeout plus
    --            grace. Without it an OLD request absorbs a LATER response that
    --            merely reuses its id. Measured before this bound existed: 71 of
    --            2,306 pairs in 24h, every one >30 min late, worst lag 11h13m.
    --
    -- The upper bound uses the request's OWN timeout and the SAME p_grace_seconds
    -- the abandoned branch below uses, so the two cannot drift apart about what
    -- "too late" means. A request that matches nothing is NOT an error -- it
    -- falls to that branch and closes 'partial', which does not touch
    -- consecutive_failures.
    --
    -- Fails open on a NULL req.created_at so rows filed before that column
    -- existed keep their previous behaviour rather than flipping to 'abandoned'.
    LEFT JOIN net._http_response resp
           ON resp.id = req.request_id
          AND (req.created_at IS NULL
               OR (resp.created >= req.created_at
                   AND resp.created <= req.created_at
                       + make_interval(secs => (COALESCE(req.timeout_ms, 5000) / 1000.0) + p_grace_seconds)))
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
    --
    -- This is also where a request whose only candidate response fell OUTSIDE
    -- the window above now lands: unverifiable, not failed.
    ELSIF r.started_at + make_interval(secs => (r.max_timeout_ms / 1000.0) + p_grace_seconds) < now()
      AND (r.started_at < now()-interval '30 minutes' OR NOT EXISTS(
        SELECT 1 FROM public.admin_automation_run_requests req
        JOIN net.http_request_queue pending ON pending.id=req.request_id WHERE req.run_id=r.id)) THEN
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

do $verify$
declare
  v_src        text;
  v_late_open  int;
  v_ambiguous  int;
begin
  v_src := pg_get_functiondef('public.admin_automation_reap_runs'::regproc);

  -- 1. BOTH bounds must be present. The lower one alone is what let this
  --    through, so asserting only "joins on request id" would pass the defect.
  if position('resp.created >= req.created_at' in v_src) = 0 then
    raise exception 'reaper lost its lower bound: a response could predate its request';
  end if;
  if position('resp.created <= req.created_at' in v_src) = 0 then
    raise exception 'reaper has no upper bound: an old request can absorb a later reused-id response';
  end if;

  -- 2. The upper bound must be derived from the request's own timeout AND the
  --    same grace the abandoned branch uses -- a hardcoded interval would drift
  --    from that branch and the two would disagree about "too late".
  if position('p_grace_seconds)))' in v_src) = 0 then
    raise exception 'reaper upper bound does not use p_grace_seconds -- it would drift from the abandoned branch';
  end if;

  -- 3. The NULL fail-open must survive. Removing it silently reclassifies every
  --    pre-column row as abandoned.
  if position('req.created_at IS NULL' in v_src) = 0 then
    raise exception 'reaper lost the NULL created_at fail-open';
  end if;

  -- 4. No live verdict may change. 0 currently-'running' runs match a response
  --    outside the new window, so this is a latent-hole fix and must be a no-op
  --    today; a non-zero count means it would reclassify real runs on the next
  --    */5 tick and wants a human first.
  select count(*) into v_late_open
    from public.admin_automation_runs run
    join public.admin_automation_run_requests req on req.run_id = run.id
    join net._http_response resp
      on resp.id = req.request_id
     and resp.created >= req.created_at
     and resp.created > req.created_at
         + make_interval(secs => (coalesce(req.timeout_ms, 5000) / 1000.0) + 120)
   where run.status = 'running';
  if v_late_open <> 0 then
    raise exception 'the new window would reclassify % open run(s) -- expected 0, read them before applying', v_late_open;
  end if;

  -- 5. Report the ambiguity this exists to contain, so a future reader sees
  --    whether the reuse is still live rather than assuming it was transient.
  select count(*) into v_ambiguous
    from (select request_id from public.admin_automation_run_requests
           group by request_id having count(distinct run_id) > 1) a;

  raise notice 'reaper window is two-sided; % request_id(s) currently ambiguous across runs', v_ambiguous;
end $verify$;
