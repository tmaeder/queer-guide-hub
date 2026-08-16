-- ============================================================================
-- Generic run tracking for cron-dispatched automations.
-- ----------------------------------------------------------------------------
-- PROBLEM (measured on prod 2026-08-16): of 144 enabled admin_automations rows
-- with action->>'type' = 'cron', 142 had last_run_at = NULL and zero rows in
-- admin_automation_runs. Nothing on the pg_cron -> net.http_post path writes
-- back, so consecutive_failures never increments and the auto-pause safety net
-- from 20260523340000 could never fire. A nightly job can fail forever in
-- silence -- and one already was: city_safety_backfill failed six consecutive
-- nights (2026-08-11 .. 2026-08-16) with "no unique or exclusion constraint
-- matching the ON CONFLICT specification" and nothing anywhere said so.
--
-- The 144 rows are THREE families, not one, and each needs a different truth
-- source. This was the central finding:
--
--   A. 74 rows whose command text calls net.http_post directly.
--   B. 20 rows whose command calls public.enqueue_workflow(), which posts
--      internally. cron.job_run_details reports "succeeded" for these the
--      instant the request is ENQUEUED, so projecting it would manufacture a
--      false green and reset consecutive_failures on every failing run.
--   C. 50 rows that are pure synchronous SQL. For these cron.job_run_details
--      IS ground truth already, retroactively, with no invocation change.
--
-- MECHANISM. Two, one per truth source:
--
--   1. DISPATCH TRUTH -- public.admin_automation_project_cron_runs() projects
--      cron.job_run_details into the registry. Owns every family's *statement*
--      outcome: a raised exception is recorded as an error run for all three,
--      and a clean return is recorded as success for family C only.
--
--   2. RESPONSE TRUTH -- families A and B additionally get their cron command
--      prefixed with admin_automation_run_begin(slug) and their net.http_post
--      calls routed through public.automation_http_post, a signature-identical
--      shim that files each pg_net request id against the open run. A */5
--      reaper then reads net._http_response BY REQUEST ID and finalizes.
--
-- WHY NOT the alternatives, all of which were measured and rejected:
--
--   * A trigger on net.http_request_queue would have been fully generic with
--     zero call-site edits, and is the design this wants to be. It is not
--     available: the table is owned by supabase_admin, postgres is not a
--     member ("must be owner of relation http_request_queue", 42501).
--   * Correlating responses by URL is impossible -- net._http_response has no
--     url column at all, and even the request queue's url is not a key
--     (city_factual_backfill and city_factual_sparql post to the SAME url).
--   * Correlating by recency silently attributes a sibling cron's response.
--     This already happened once during the #2795 verification, where a
--     translate-i18n-batch response was mistaken for the adult-links one.
--     Hence the request id is the PRIMARY KEY of the link table below: the
--     "newest row" mistake is not merely discouraged here, it is unspellable.
--   * Per-function helpers (the #2795 shape) work but cost ~50 lines in every
--     one of 225 edge functions and cannot see a function that never responds.
--
-- The reaper is the only layer that catches a target which never answers at
-- all: an unanswered request has no response row, so after its own
-- timeout_milliseconds plus a grace period the run is failed deliberately
-- rather than left open. net._http_response is retained ~6h (measured), which
-- is why the reaper runs every 5 minutes and not hourly.
--
-- Registry stays the single source of truth: admin_automations.action.command
-- keeps the ORIGINAL, readable SQL. The wrapped form exists only in pg_cron,
-- is derived by admin_automation_effective_command(), and is applied by
-- sync_automations_to_cron()'s new command-drift branch -- so one reconciler
-- pass converts every job and a hand-edited cron command is reverted, exactly
-- as a hand-edited schedule already is.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- 'running' is a new, non-terminal state: the row exists from dispatch until
-- the reaper resolves it. The existing vocabulary had no way to say "in
-- flight", which is why an async dispatch could not be represented at all.
ALTER TABLE public.admin_automation_runs
  DROP CONSTRAINT IF EXISTS admin_automation_runs_status_check;
ALTER TABLE public.admin_automation_runs
  ADD CONSTRAINT admin_automation_runs_status_check
  CHECK (status IN ('success', 'partial', 'error', 'dry_run', 'running'));

-- Dedupe key for the projector. A cron.job_run_details row maps to at most one
-- registry run, so re-running the projector is a no-op instead of a duplicate.
ALTER TABLE public.admin_automation_runs
  ADD COLUMN IF NOT EXISTS cron_runid bigint;
CREATE UNIQUE INDEX IF NOT EXISTS admin_automation_runs_cron_runid_key
  ON public.admin_automation_runs (cron_runid) WHERE cron_runid IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_automation_runs_open_idx
  ON public.admin_automation_runs (started_at)
  WHERE status = 'running';

-- The projector's cursor. Monotonic; pg_cron runids only increase.
ALTER TABLE public.admin_automations
  ADD COLUMN IF NOT EXISTS last_cron_runid bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.admin_automations.last_cron_runid IS
  'Highest cron.job_run_details.runid already projected into admin_automation_runs. Advanced only past TERMINAL rows, so an in-flight execution is never skipped.';

-- request_id is the PRIMARY KEY, not merely a column: a pg_net request belongs
-- to exactly one run, and making that a constraint is what stops a future
-- reader from resolving a response by recency.
CREATE TABLE IF NOT EXISTS public.admin_automation_run_requests (
  request_id  bigint PRIMARY KEY,
  run_id      bigint NOT NULL REFERENCES public.admin_automation_runs(id) ON DELETE CASCADE,
  url         text,
  timeout_ms  int NOT NULL DEFAULT 5000,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_automation_run_requests_run_idx
  ON public.admin_automation_run_requests (run_id);

COMMENT ON TABLE public.admin_automation_run_requests IS
  'Links an admin_automation_runs row to the pg_net request ids it issued. The reaper joins net._http_response on request_id -- never on recency, and never on url (net._http_response has no url, and urls are not unique across jobs anyway).';

ALTER TABLE public.admin_automation_run_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_automation_run_requests_select" ON public.admin_automation_run_requests;
CREATE POLICY "admin_automation_run_requests_select"
  ON public.admin_automation_run_requests FOR SELECT
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

-- New tables need explicit grants in this project; RLS alone reaches nothing.
GRANT SELECT ON public.admin_automation_run_requests TO authenticated;

-- Functions that have been PATCHED to post through automation_http_post. Only
-- a listed caller may be wrapped: wrapping a command whose helper still calls
-- net.http_post directly would produce a run with zero requests, which the
-- reaper correctly reads as a no-op success -- a false green, worse than the
-- blank column this migration exists to fix. Membership is therefore proof of
-- patching, not a wish list.
CREATE TABLE IF NOT EXISTS public.admin_automation_tracked_callers (
  fn_name text PRIMARY KEY,
  note    text
);

INSERT INTO public.admin_automation_tracked_callers (fn_name, note) VALUES
  ('enqueue_workflow',       'Patched below to post via automation_http_post. Backs the 20 wf_*/pipeline_* cron rows.'),
  ('admin_enqueue_workflow', 'Delegates to enqueue_workflow, so it inherits the tracking.')
ON CONFLICT (fn_name) DO UPDATE SET note = EXCLUDED.note;

-- ---------------------------------------------------------------------------
-- 2. Capture
-- ---------------------------------------------------------------------------

-- Named automation_http_post, NOT http_post: extensions.http_post already
-- exists (the `http` extension ships two overloads), and a public.http_post
-- would make every unqualified call in the codebase resolution-order
-- dependent.
--
-- Parameter names are byte-identical to net.http_post's because every call
-- site in the wild uses named arguments (url :=, headers :=, body :=,
-- timeout_milliseconds :=). That is what makes the rewrite a pure token
-- substitution rather than an argument-list parse -- which matters, since the
-- 74 commands include a DO block, a WITH ... WHERE EXISTS, and two that post
-- twice in one statement. None of those survive an expression-level wrap.
CREATE OR REPLACE FUNCTION public.automation_http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id bigint;
  v_run_id     text;
BEGIN
  v_request_id := net.http_post(
    url := url,
    body := body,
    params := params,
    headers := headers,
    timeout_milliseconds := timeout_milliseconds
  );

  -- Transaction-local, set by admin_automation_run_begin. Absent means the
  -- caller is not inside a tracked automation run -- pass straight through.
  v_run_id := NULLIF(current_setting('app.automation_run_id', true), '');

  IF v_run_id IS NOT NULL THEN
    INSERT INTO public.admin_automation_run_requests (request_id, run_id, url, timeout_ms)
    VALUES (v_request_id, v_run_id::bigint, url, COALESCE(timeout_milliseconds, 5000))
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.automation_http_post(text, jsonb, jsonb, jsonb, integer) IS
  'Signature-identical shim over net.http_post that files the returned pg_net request id against the automation run opened by admin_automation_run_begin. Outside a run it is a plain passthrough.';

ALTER FUNCTION public.automation_http_post(text, jsonb, jsonb, jsonb, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.automation_http_post(text, jsonb, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_http_post(text, jsonb, jsonb, jsonb, integer) TO service_role;

-- Deliberately NOT granted to anon/authenticated even though net.http_post
-- itself is (a pre-existing surface, out of scope here). A SECURITY DEFINER
-- wrapper handed to anon would be a strict widening.

CREATE OR REPLACE FUNCTION public.admin_automation_run_begin(p_slug text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id bigint;
BEGIN
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;

  -- Unknown slug: do not raise. The wrapper is generated FROM the registry, so
  -- this only happens if the row was deleted while its cron survived -- and
  -- killing live work over missing bookkeeping is the wrong trade. The orphan
  -- is already reported by sync_automations_to_cron branch (a) and by
  -- pipeline_hygiene_stats().unregistered_cron_jobs.
  IF v_automation_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.admin_automation_runs (automation_id, automation_slug, status, started_at)
  VALUES (v_automation_id, p_slug, 'running', now())
  RETURNING id INTO v_run_id;

  -- is_local = true. The GUC must not survive the transaction: pg_cron reuses
  -- backends, and a leaked run id would file the NEXT job's requests against
  -- this job's run.
  PERFORM set_config('app.automation_run_id', v_run_id::text, true);

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.admin_automation_run_begin(text) IS
  'Opens a running admin_automation_runs row and publishes its id in the transaction-local GUC app.automation_run_id, which automation_http_post reads. Prefixed onto the pg_cron command by admin_automation_effective_command().';

ALTER FUNCTION public.admin_automation_run_begin(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_automation_run_begin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_run_begin(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Patch the one tracked indirect caller
-- ---------------------------------------------------------------------------
-- Reproduced verbatim from the live definition with exactly one line changed:
-- net.http_post -> public.automation_http_post. enqueue_workflow already
-- stored the request id on workflow_runs.invoke_request_id, so keying off the
-- request id is the established shape here, not a new idea.
CREATE OR REPLACE FUNCTION public.enqueue_workflow(
  p_workflow_name text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_triggered_by text DEFAULT 'cron'::text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def record;
  v_running int;
  v_secret text;
  v_run_id uuid;
  v_request_id bigint;
  v_triggered text;
BEGIN
  SELECT id, name, edge_function, default_payload, max_concurrency, timeout_seconds
  INTO v_def
  FROM workflow_definitions
  WHERE name = p_workflow_name AND is_enabled = true;

  IF v_def.id IS NULL THEN
    RAISE EXCEPTION 'Workflow "%" not found or disabled', p_workflow_name;
  END IF;

  SELECT count(*) INTO v_running
  FROM workflow_runs
  WHERE workflow_name = p_workflow_name
    AND status = 'running'
    AND started_at > now() - make_interval(secs => COALESCE(v_def.timeout_seconds, 600) * 2);
  IF v_running >= COALESCE(v_def.max_concurrency, 1) THEN
    RETURN -1;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'internal_invoke_secret missing from vault';
  END IF;

  v_triggered := CASE WHEN p_triggered_by IN ('cron','webhook','admin','api','system','db_trigger')
                      THEN p_triggered_by ELSE 'system' END;

  INSERT INTO workflow_runs
    (definition_id, workflow_name, queue_name, status, attempt, max_attempts,
     input_payload, queued_at, started_at, triggered_by, idempotency_key)
  VALUES
    (v_def.id, p_workflow_name, 'direct', 'running', 1, 1,
     COALESCE(v_def.default_payload, '{}'::jsonb) || p_payload, now(), now(), v_triggered,
     p_workflow_name || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS'))
  RETURNING id INTO v_run_id;

  SELECT public.automation_http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/' || v_def.edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'X-Internal-Secret', v_secret
    ),
    body := COALESCE(v_def.default_payload, '{}'::jsonb) || p_payload
            || jsonb_build_object('workflow', p_workflow_name,
                                  'triggered_by', v_triggered,
                                  'workflow_run_id', v_run_id),
    timeout_milliseconds := LEAST(COALESCE(v_def.timeout_seconds, 300), 300) * 1000
  ) INTO v_request_id;

  UPDATE workflow_runs SET invoke_request_id = v_request_id, updated_at = now()
  WHERE id = v_run_id;

  RETURN v_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Effective command (registry -> pg_cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_automation_effective_command(p_slug text, p_command text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cmd text;
  v_tracked boolean := false;
BEGIN
  IF p_command IS NULL OR btrim(p_command) = '' THEN
    RETURN NULL;
  END IF;

  v_cmd := btrim(p_command);

  -- Family A: direct net.http_post. Token substitution, no parsing -- this is
  -- what survives the DO block and the double-post commands.
  IF v_cmd ILIKE '%net.http_post%' THEN
    v_cmd := regexp_replace(v_cmd, '\mnet\.http_post\M', 'public.automation_http_post', 'gi');
    v_tracked := true;
  END IF;

  -- Family B: a helper that has been patched to route through the shim.
  IF NOT v_tracked THEN
    SELECT EXISTS (
      SELECT 1 FROM public.admin_automation_tracked_callers c
      WHERE v_cmd ~* ('\m' || c.fn_name || '\s*\(')
    ) INTO v_tracked;
  END IF;

  -- Family C: pure SQL. Left completely alone -- cron.job_run_details is
  -- already exact for it, and an unnecessary wrap would only add a row to
  -- reap.
  IF NOT v_tracked THEN
    RETURN p_command;
  END IF;

  IF right(btrim(v_cmd), 1) <> ';' THEN
    v_cmd := v_cmd || ';';
  END IF;

  RETURN 'SELECT public.admin_automation_run_begin(' || quote_literal(p_slug) || '); ' || v_cmd;
END;
$$;

COMMENT ON FUNCTION public.admin_automation_effective_command(text, text) IS
  'Derives the pg_cron command from the registry command. The registry keeps the original readable SQL; only pg_cron holds the wrapped form, so the registry stays the single source of truth.';

REVOKE ALL ON FUNCTION public.admin_automation_effective_command(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_effective_command(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Reaper -- response truth for families A and B
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_automation_reap_runs(p_grace_seconds int DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      COUNT(*) FILTER (
        WHERE resp.id IS NOT NULL
          AND (resp.status_code >= 400 OR resp.timed_out OR resp.error_msg IS NOT NULL)
      )                                                            AS n_bad,
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
      UPDATE public.admin_automation_runs
      SET status = CASE WHEN r.n_bad > 0 THEN 'error' ELSE 'success' END,
          finished_at = now(),
          error = CASE WHEN r.n_bad > 0
                       THEN r.n_bad || ' of ' || r.n_req || ' request(s) failed'
                       ELSE NULL END,
          summary = jsonb_build_object('requests', r.detail)
      WHERE id = r.id;
      v_finalized := v_finalized + 1;
      IF r.n_bad > 0 THEN v_failed := v_failed + 1; END IF;

    -- Responses missing past the request's OWN timeout plus grace. pg_net
    -- writes a timed_out response row of its own accord, so absence this late
    -- means the request vanished (worker restart) or the target never
    -- answered. Failing it deliberately is the only way a
    -- never-responds target ever reaches the auto-pause counter -- and is the
    -- one thing no per-edge-function helper can do, since a function that
    -- never runs cannot report on itself.
    ELSIF r.started_at + make_interval(secs => (r.max_timeout_ms / 1000.0) + p_grace_seconds) < now() THEN
      UPDATE public.admin_automation_runs
      SET status = 'error', finished_at = now(),
          error = 'no response recorded for ' || (r.n_req - r.n_resp) || ' of ' || r.n_req
                  || ' request(s) within timeout + grace',
          summary = jsonb_build_object('requests', r.detail, 'abandoned', true)
      WHERE id = r.id;
      v_finalized := v_finalized + 1;
      v_failed := v_failed + 1;
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
$$;

COMMENT ON FUNCTION public.admin_automation_reap_runs(int) IS
  'Finalizes open automation runs from net._http_response, joined BY REQUEST ID. Must run well inside pg_net response retention (~6h measured), hence the */5 schedule.';

REVOKE ALL ON FUNCTION public.admin_automation_reap_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_reap_runs(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Projector -- dispatch truth for every family
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_automation_project_cron_runs(p_limit int DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a            record;
  d            record;
  v_jobid      bigint;
  v_is_tracked boolean;
  v_cursor     bigint;
  v_errors     int := 0;
  v_successes  int := 0;
  v_rows       int := 0;
BEGIN
  FOR a IN
    SELECT id, slug, last_cron_runid, COALESCE(action->>'jobname', slug) AS jobname
    FROM public.admin_automations
    WHERE action->>'type' = 'cron'
  LOOP
    SELECT jobid, command ILIKE '%admin\_automation\_run\_begin%'
    INTO v_jobid, v_is_tracked
    FROM cron.job WHERE jobname = a.jobname;

    CONTINUE WHEN v_jobid IS NULL;

    v_cursor := a.last_cron_runid;

    FOR d IN
      SELECT runid, status, return_message, start_time, end_time
      FROM cron.job_run_details
      WHERE jobid = v_jobid AND runid > a.last_cron_runid
      ORDER BY runid
      LIMIT p_limit
    LOOP
      -- Stop at the first non-terminal row and leave the cursor behind it.
      -- 'connecting'/'running'/'sending' rows are rewritten in place when the
      -- execution lands; consuming one would record an outcome that has not
      -- happened yet and permanently skip the real one.
      EXIT WHEN d.status NOT IN ('succeeded', 'failed');

      IF d.status = 'failed' THEN
        -- Recorded for ALL families. A tracked job whose command raised never
        -- got to open a run row -- the whole pg_cron transaction rolled back,
        -- taking the bookkeeping with it -- so this is the ONLY evidence that
        -- the execution happened at all.
        INSERT INTO public.admin_automation_runs
          (automation_id, automation_slug, status, started_at, finished_at, error, cron_runid, summary)
        VALUES
          (a.id, a.slug, 'error', COALESCE(d.start_time, now()), COALESCE(d.end_time, now()),
           left(COALESCE(d.return_message, 'cron execution failed'), 4000), d.runid,
           jsonb_build_object('source', 'cron.job_run_details'))
        -- The predicate must be repeated: the unique index is PARTIAL, and
        -- ON CONFLICT cannot infer a partial index from the column list alone.
        ON CONFLICT (cron_runid) WHERE cron_runid IS NOT NULL DO NOTHING;
        v_errors := v_errors + 1;

      ELSIF NOT v_is_tracked THEN
        -- Family C only. For a tracked job "succeeded" means the request was
        -- ENQUEUED, nothing more -- claiming success here would reset
        -- consecutive_failures on every failing run and re-break auto-pause in
        -- a way that looks healthy. The reaper owns that verdict.
        UPDATE public.admin_automations
        SET last_run_at = COALESCE(d.end_time, d.start_time, now()),
            last_run_status = 'success',
            consecutive_failures = 0
        WHERE id = a.id;

        -- Sampled, not per-execution: four registered jobs fire every minute
        -- and the projector would otherwise add ~10k rows/day to a
        -- disk-constrained database. Failures are always kept; successes keep
        -- an hourly trail, which is all the audit log needs to show liveness.
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_automation_runs
          WHERE automation_slug = a.slug AND status = 'success'
            AND started_at > now() - interval '1 hour'
        ) THEN
          INSERT INTO public.admin_automation_runs
            (automation_id, automation_slug, status, started_at, finished_at, cron_runid, summary)
          VALUES
            (a.id, a.slug, 'success', COALESCE(d.start_time, now()), COALESCE(d.end_time, now()), d.runid,
             jsonb_build_object('source', 'cron.job_run_details', 'sampled', true))
          ON CONFLICT (cron_runid) WHERE cron_runid IS NOT NULL DO NOTHING;
        END IF;
        v_successes := v_successes + 1;
      END IF;

      v_cursor := d.runid;
      v_rows := v_rows + 1;
    END LOOP;

    IF v_cursor > a.last_cron_runid THEN
      UPDATE public.admin_automations SET last_cron_runid = v_cursor WHERE id = a.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('projected', v_rows, 'errors', v_errors, 'successes', v_successes);
END;
$$;

COMMENT ON FUNCTION public.admin_automation_project_cron_runs(int) IS
  'Projects cron.job_run_details into admin_automation_runs. Records failures for every family; records successes only for jobs that are NOT http-tracked, because for those "succeeded" only means the request was enqueued.';

REVOKE ALL ON FUNCTION public.admin_automation_project_cron_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_automation_project_cron_runs(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Auto-pause wiring
-- ---------------------------------------------------------------------------
-- The 20260523340000 trigger fired BEFORE UPDATE only, so a row INSERTed
-- already-finished (which is exactly what the projector does) never reached
-- the counter. It also never stamped last_run_at/last_run_status, which is why
-- the admin column stayed blank even for the two automations that did record.
CREATE OR REPLACE FUNCTION public.admin_automation_runs_after_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_failures int;
  v_threshold int;
BEGIN
  -- Only a transition INTO a finished state counts, exactly once. An INSERT of
  -- a 'running' row is not one; the UPDATE that finalizes it is.
  IF NEW.finished_at IS NULL THEN
    RETURN NEW;
  END IF;
  -- OLD must be read only under TG_OP='UPDATE'; in an INSERT trigger the
  -- record is unassigned and touching a field raises.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.finished_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.status = 'error' THEN
    UPDATE public.admin_automations
    SET consecutive_failures = consecutive_failures + 1,
        last_run_at = NEW.finished_at,
        last_run_status = 'error'
    WHERE id = NEW.automation_id
    RETURNING consecutive_failures, auto_pause_threshold
    INTO v_now_failures, v_threshold;

    IF v_now_failures IS NOT NULL AND v_now_failures >= v_threshold THEN
      UPDATE public.admin_automations
      SET enabled = false,
          last_run_status = 'auto_paused'
      WHERE id = NEW.automation_id;

      NEW.summary := COALESCE(NEW.summary, '{}'::jsonb)
                     || jsonb_build_object(
                          'auto_paused', true,
                          'reason', 'consecutive_failures >= ' || v_threshold,
                          'consecutive_failures', v_now_failures
                        );
    END IF;

  ELSIF NEW.status IN ('success', 'partial') THEN
    UPDATE public.admin_automations
    SET consecutive_failures = 0,
        last_run_at = NEW.finished_at,
        last_run_status = NEW.status
    WHERE id = NEW.automation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_automation_runs_after_finish_trg ON public.admin_automation_runs;
CREATE TRIGGER admin_automation_runs_after_finish_trg
  BEFORE INSERT OR UPDATE ON public.admin_automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_automation_runs_after_finish();

-- ---------------------------------------------------------------------------
-- 8. Reconciler: registry command wins over pg_cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_automations_to_cron(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unregistered jsonb;
  v_killed       jsonb := '[]'::jsonb;
  v_fixed        jsonb := '[]'::jsonb;
  v_recreated    jsonb := '[]'::jsonb;
  v_rewrapped    jsonb := '[]'::jsonb;
  r record;
BEGIN
  -- a) Rogue crons: active, no registry row. Report only -- never auto-kill.
  SELECT COALESCE(jsonb_agg(j.jobname), '[]'::jsonb) INTO v_unregistered
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (
      SELECT 1 FROM admin_automations a
      WHERE a.action->>'jobname' = j.jobname
         OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
    );

  -- b) Kill switch: registry disabled, cron still scheduled.
  FOR r IN
    SELECT j.jobname
    FROM admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled = false
  LOOP
    IF p_apply THEN PERFORM cron.unschedule(r.jobname); END IF;
    v_killed := v_killed || to_jsonb(r.jobname);
  END LOOP;

  -- c) Schedule drift: registry schedule wins.
  FOR r IN
    SELECT j.jobid, j.jobname, a.schedule AS want, j.schedule AS have
    FROM admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled
      AND a.schedule IS NOT NULL
      AND a.schedule <> j.schedule
  LOOP
    IF p_apply THEN PERFORM cron.alter_job(r.jobid, schedule => r.want); END IF;
    v_fixed := v_fixed || jsonb_build_object('jobname', r.jobname, 'from', r.have, 'to', r.want);
  END LOOP;

  -- c2) Command drift: the registry command, wrapped, wins. This is what
  -- converts every http-dispatching job to tracked form -- one reconciler pass
  -- instead of 94 hand edits -- and what keeps it converted if a later
  -- migration re-schedules the raw command.
  FOR r IN
    SELECT j.jobid, j.jobname,
           public.admin_automation_effective_command(a.slug, a.action->>'command') AS want,
           j.command AS have
    FROM admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled
      AND a.action->>'type' = 'cron'
      AND a.action->>'command' IS NOT NULL
      AND public.admin_automation_effective_command(a.slug, a.action->>'command') IS DISTINCT FROM j.command
  LOOP
    IF p_apply THEN PERFORM cron.alter_job(r.jobid, command => r.want); END IF;
    v_rewrapped := v_rewrapped || jsonb_build_object('jobname', r.jobname);
  END LOOP;

  -- d) Missing crons: enabled registry row with a stored command, no cron job.
  FOR r IN
    SELECT COALESCE(a.action->>'jobname', a.slug) AS jobname,
           a.schedule,
           public.admin_automation_effective_command(a.slug, a.action->>'command') AS command
    FROM admin_automations a
    WHERE a.enabled
      AND a.schedule IS NOT NULL
      AND a.action->>'command' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM cron.job j WHERE j.jobname = COALESCE(a.action->>'jobname', a.slug)
      )
  LOOP
    IF p_apply THEN PERFORM cron.schedule(r.jobname, r.schedule, r.command); END IF;
    v_recreated := v_recreated || to_jsonb(r.jobname);
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'unregistered', v_unregistered,
    'disabled_killed', v_killed,
    'schedule_fixed', v_fixed,
    'command_rewrapped', v_rewrapped,
    'recreated', v_recreated
  );
END $$;

COMMENT ON FUNCTION public.sync_automations_to_cron(boolean) IS
  'Reconciles admin_automations (registry of record) into pg_cron: kills crons whose registry row is disabled, fixes schedule drift, rewrites commands into their tracked form, re-creates missing jobs. Unregistered crons are reported, never killed. p_apply=false = dry run.';

REVOKE ALL ON FUNCTION public.sync_automations_to_cron(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_automations_to_cron(boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Retention
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_admin_automation_runs(p_days int DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted bigint;
BEGIN
  WITH gone AS (
    DELETE FROM public.admin_automation_runs
    WHERE started_at < now() - make_interval(days => p_days)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_admin_automation_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_admin_automation_runs(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Schedule the two new jobs -- registry row FIRST, then cron, per the
--     "registry is the record" contract.
-- ---------------------------------------------------------------------------
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('admin_automation_reap',
   'Automation run reaper',
   'Finalizes open automation runs from net._http_response, joined by request id. Must stay well inside pg_net response retention (~6h).',
   'system', true, '{"type": "schedule"}'::jsonb, '[]'::jsonb,
   jsonb_build_object('type','cron','jobname','admin_automation_reap',
                      'command','SELECT public.admin_automation_reap_runs();'),
   '*/5 * * * *'),
  ('admin_automation_project',
   'Automation run projector',
   'Projects cron.job_run_details into admin_automation_runs so a raised exception reaches consecutive_failures for every family.',
   'system', true, '{"type": "schedule"}'::jsonb, '[]'::jsonb,
   jsonb_build_object('type','cron','jobname','admin_automation_project',
                      'command','SELECT public.admin_automation_project_cron_runs();'),
   '*/5 * * * *'),
  ('admin_automation_runs_purge',
   'Automation run history purge',
   'Keeps 30 days of admin_automation_runs.',
   'system', true, '{"type": "schedule"}'::jsonb, '[]'::jsonb,
   jsonb_build_object('type','cron','jobname','admin_automation_runs_purge',
                      'command','SELECT public.prune_admin_automation_runs(30);'),
   '35 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action,
      schedule = EXCLUDED.schedule, enabled = true, updated_at = now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT slug, schedule, action->>'command' AS command
    FROM public.admin_automations
    WHERE slug IN ('admin_automation_reap', 'admin_automation_project', 'admin_automation_runs_purge')
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = r.slug) THEN
      PERFORM cron.unschedule(r.slug);
    END IF;
    PERFORM cron.schedule(r.slug, r.schedule, r.command);
  END LOOP;
END $$;

-- Start every automation's cursor at the current head. Backfilling seven days
-- of history would auto-pause anything that has been failing all week the
-- instant this lands -- which is a real outcome to choose deliberately, not a
-- side effect of a migration. Forward-only from here.
--
-- `last_cron_runid = 0` guard: this migration is applied to prod ahead of merge
-- via execute_sql (which does not record schema_migrations), so CI re-runs it.
-- Without the guard the second run would jump every cursor to the then-current
-- head and silently discard whatever the projector recorded in between.
UPDATE public.admin_automations
SET last_cron_runid = COALESCE((SELECT max(runid) FROM cron.job_run_details), 0)
WHERE action->>'type' = 'cron'
  AND last_cron_runid = 0;

-- ---------------------------------------------------------------------------
-- 11. Hygiene: a job that records nothing is now itself a detectable fault
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_automation_tracking_gaps()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scheduled AS (
    SELECT a.slug, a.last_run_at, j.command
    FROM public.admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled AND a.action->>'type' = 'cron' AND j.active
      -- at most daily, so "silent for 48h" is unambiguous
      AND a.schedule !~ '^\*|^@'
  )
  SELECT jsonb_build_object(
    'silent_automations', COALESCE((
      SELECT jsonb_agg(slug ORDER BY slug) FROM scheduled
      WHERE last_run_at IS NULL OR last_run_at < now() - interval '48 hours'
    ), '[]'::jsonb),
    'untracked_http_dispatchers', COALESCE((
      SELECT jsonb_agg(a.slug ORDER BY a.slug)
      FROM public.admin_automations a
      JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
      WHERE a.enabled AND a.action->>'type' = 'cron' AND j.active
        AND j.command NOT ILIKE '%admin\_automation\_run\_begin%'
        AND EXISTS (
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.prosrc ~ '\mnet\.http_post\M'
            AND j.command ~* ('\m' || p.proname || '\s*\(')
        )
    ), '[]'::jsonb),
    'open_runs_over_1h', (
      SELECT count(*) FROM public.admin_automation_runs
      WHERE status = 'running' AND started_at < now() - interval '1 hour'
    )
  );
$$;

COMMENT ON FUNCTION public.admin_automation_tracking_gaps() IS
  'untracked_http_dispatchers is the regression guard: a cron command that reaches net.http_post through an UNPATCHED helper would be projected as a false success. Patch the helper and register it in admin_automation_tracked_callers.';

REVOKE ALL ON FUNCTION public.admin_automation_tracking_gaps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_automation_tracking_gaps() TO service_role, authenticated;
