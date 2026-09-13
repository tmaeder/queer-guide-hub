-- Personality staging drain chain + the orphan sentinel that would have found it.
--
-- WHAT WAS BROKEN
--
-- 929 rows (source_name='wikipedia-lgbtq-category-import') sat in
-- ingestion_staging from 2026-08-20 to 2026-09-13 at ai_validation_status
-- 'pending' with ZERO ingestion_events in 30 days. Nothing had ever touched
-- them, and the nightly `personality-ingestion` DAG reported `completed` with
-- items_succeeded=979 every single night while doing so.
--
-- The cause is that rows inserted into ingestion_staging OUTSIDE a DAG run
-- carry `pipeline_run_id IS NULL`, and four of the five stage functions filter
-- `.eq('pipeline_run_id', <run>)` when the executor passes one. `.eq()` never
-- matches NULL, so the DAG is structurally blind to them:
--
--     validate      filters on pipeline_run_id  -> blind to NULL
--     deduplicate   filters                     -> blind
--     review-gate   filters                     -> blind
--     commit        filters                     -> blind
--     quality-score does NOT filter             -> the only stage that saw anything
--
-- That asymmetry is visible in the run record: the `source` node emitted 929,
-- `normalize` received 0, and `quality` alone reported items_out=50. A run that
-- completes having moved nothing is the documented trap — `workflow_runs` /
-- `pipeline_runs` status is not evidence that work happened.
--
-- The fix for that class already exists and is called a dual-mode drain: the
-- same stage function invoked by its own cron WITHOUT a run id, scoped by
-- target_table or entity_type instead. Every other entity family has one and
-- all of them ran today: ev_drain_* (6 stages), vn_drain_* (4),
-- mp_drain_* (5), news_drain_* (3). `personalities` had TWO registered and
-- both disabled, plus no review or commit stage at all.
--
-- THE TWO DISABLED ROWS WERE NOT AN OVERSIGHT, AND THAT IS WHY THIS HEADER IS
-- LONG. personality_drain_validate carried this description:
--
--     "DISABLED pending a human decision: publishing a person as LGBTQ+ is an
--      outing decision. 929 rows staged 2026-08-20."
--
-- A previous session reached the same conclusion and deliberately parked the
-- chain rather than draining a corpus whose LGBTQ+ assertion rests on Wikipedia
-- category membership alone. That hold was correct and is only being released
-- because its condition is now met, in two parts:
--
--   1. A human decided (2026-09-13) to drain the backlog.
--   2. The payload no longer publishes anyone. Every one of the 929 rows was
--      rewritten to visibility='draft' on 2026-09-13; before that, 543 carried
--      'public' of which 434 were living people (90 non-binary, 45 gay, 29
--      trans, 21 lesbian, 16 bi), and commit_personality_staging_item honours
--      the payload's visibility (`coalesce(nullif(v_norm->>'visibility',''),
--      'draft')`), so they WOULD have published. The outing guard would not
--      have stopped it: personalities_enforce_outing_guard only demotes a
--      living public row that lacks a well-formed wikidata_qid, and all 929
--      carry one -- a QID attests that a person EXISTS, never that their
--      orientation is sourced.
--
-- So draining is now safe in the only sense that matters: the rows land as
-- drafts for human review, not as published claims. Anyone re-enabling a
-- personality drain in future should re-check that second condition rather
-- than assuming it, because it is a property of the staged payload and not of
-- this migration.
--
-- WHY A SENTINEL, AND WHY IT IS NOT A DEPTH THRESHOLD
--
-- pipeline_hygiene_stats().stale_pending_by_entity DID report these 929 the
-- whole time. It could not surface them because check-pipeline-health.mjs
-- hard-fails only above 5,000 rows for one entity or 10,000 in total, and
-- warns above 3,500 -- a bar the news backlog (4,086) keeps permanently lit,
-- so the warning that did fire every night said nothing a reader could act on.
-- This is the same shape CLAUDE.md already records for stranded_human_approved:
-- 14 event rows hid under that same 3,500 floor for 40 days.
--
-- staging_orphan_signals() therefore measures a STRUCTURAL property, not a
-- depth: are there stale rows the DAG cannot see, and has ANY of them advanced
-- a stage in the last 24 hours? A backlog with a working consumer is
-- throughput and must not page anyone; a backlog with no consumer is this bug.
-- The evidence is ingestion_events rather than ingestion_staging.updated_at,
-- deliberately -- the 2026-09-13 visibility repair touched all 929 rows, so
-- updated_at now reads "recently touched" for a cohort nothing has ever
-- processed. A stage-advance event cannot be forged by an unrelated UPDATE.
--
-- staging_unreachable_stats() does not cover this: it is news-only by design
-- (applying it to every entity type reported 406 venue/marketplace rows
-- legitimately queued for HUMAN review as unreachable).

-- ---------------------------------------------------------------------------
-- PART A -- the sentinel
-- ---------------------------------------------------------------------------

-- Standalone, NOT a new key on pipeline_hygiene_stats(): that function is a
-- ~150-line CREATE OR REPLACE and adding a key means restating every other one
-- by hand, which is a merge-collision surface. Same precedent as
-- event_dup_signals / venue_dup_signals / news_image_signals.
--
-- SECURITY INVOKER on purpose. The definer reflex is what leaked safety-gated
-- events to anon via _dedup_venue_cluster_side; service_role bypasses RLS on
-- its own, so a definer here would buy nothing and risk exactly that.
CREATE OR REPLACE FUNCTION public.staging_orphan_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH orphans AS (
    SELECT s.id, s.target_table, s.created_at
    FROM public.ingestion_staging s
    WHERE s.pipeline_run_id IS NULL          -- invisible to every DAG-scoped stage
      AND s.ai_validation_status = 'pending'
      AND s.disposition = 'pending'
      AND s.normalized_data IS NOT NULL      -- mirrors the stage selectors
      AND s.created_at < now() - interval '48 hours'
  ),
  per_target AS (
    SELECT o.target_table,
           count(DISTINCT o.id)                       AS rows,
           min(o.created_at)                          AS oldest,
           max(e.created_at)                          AS last_advance
    FROM orphans o
    LEFT JOIN public.ingestion_events e
           ON e.staging_id = o.id
          AND e.created_at > now() - interval '24 hours'
    GROUP BY o.target_table
  )
  SELECT jsonb_build_object(
    -- Reported separately from the counts so an undeployed or erroring probe
    -- can never read as a clean corpus.
    'probe_ok', true,
    'orphan_rows_by_target',
      COALESCE((SELECT jsonb_object_agg(target_table, rows) FROM per_target), '{}'::jsonb),
    'oldest_orphan_days',
      COALESCE((SELECT jsonb_object_agg(target_table,
                 round(extract(epoch FROM now() - oldest) / 86400.0)::int)
                FROM per_target), '{}'::jsonb),
    -- THE HARD-FAIL KEY: orphans exist and not one of them advanced a stage in
    -- 24h, i.e. no consumer exists for that target_table.
    'unconsumed_targets',
      COALESCE((SELECT jsonb_agg(target_table ORDER BY target_table)
                FROM per_target WHERE last_advance IS NULL), '[]'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.staging_orphan_signals() IS
  'Staging rows with pipeline_run_id IS NULL are invisible to every DAG-scoped stage '
  '(validate/dedup/review-gate/commit all filter on it; quality-score does not). '
  'unconsumed_targets lists target_tables whose stale orphans have had NO ingestion_events '
  'stage advance in 24h -- i.e. no dual-mode drain is consuming them. Structural, not a depth '
  'threshold: a backlog with a working drain is throughput and must not page anyone.';

REVOKE ALL ON FUNCTION public.staging_orphan_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_orphan_signals() TO service_role;

-- ---------------------------------------------------------------------------
-- PART B -- complete the personality drain chain
-- ---------------------------------------------------------------------------

-- Soft on preconditions: a concurrent session may already have enabled these.
-- Hard on postconditions -- see the assertion block at the end.
UPDATE public.admin_automations
   SET enabled = true,
       description = 'Personality staging drain stage. Hourly: moves personality rows staged '
                     'outside a DAG run (pipeline_run_id IS NULL) through validate -> dedup -> '
                     'review -> commit. Released 2026-09-13 after the staged payload was '
                     'rewritten to visibility=draft, so committed rows land as drafts for human '
                     'review rather than as published LGBTQ+ claims.',
       updated_at = now()
 WHERE slug IN ('personality_drain_validate', 'personality_drain_dedup')
   AND enabled = false;

-- The two missing stages. Both are CLONED from their working venue twins so the
-- url, the anon bearer and the vault lookup are copied rather than re-typed --
-- a hand-copied secret or endpoint is how a drain silently 401s forever.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT
  'personality_drain_review',
  'personality-drain-review',
  'Personality staging drain stage. Hourly: routes validated+deduped personality rows through '
  'the review gate so low-confidence rows land in review_queue instead of committing. '
  'Load-bearing for this corpus: commit accepts review_status IN (auto, approved), so without '
  'this stage every staged row would auto-commit unexamined.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  jsonb_build_object(
    'type',    'cron',
    'jobname', 'personality-drain-review',
    'command', replace(v.action->>'command', '"entityType":"venue"', '"entityType":"personality"')
  ),
  '47 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'vn_drain_review'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug = 'personality_drain_review');

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT
  'personality_drain_commit',
  'personality-drain-commit',
  'Personality staging drain stage. Hourly: commits rows that cleared validate/dedup/review. '
  'commit_personality_staging_batch requires dedup_status IN (unique,duplicate,merge_candidate), '
  'so the dedup stage is not optional -- rows left at dedup_status=pending are never committed.',
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  jsonb_build_object(
    'type',    'cron',
    'jobname', 'personality-drain-commit',
    'command', replace(v.action->>'command',
                       'commit_venue_staging_batch', 'commit_personality_staging_batch')
  ),
  '51 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'vn_drain_commit'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug = 'personality_drain_commit');

-- Schedule all four with the WRAPPED form. A cron installed by a migration
-- carries the RAW command and fires untracked until the nightly 05:10
-- reconciler rewrites it -- so the first runs would write no
-- admin_automation_runs row and auto-pause could not fire for them.
-- admin_automation_effective_command() is the same derivation
-- sync_automations_to_cron() applies, so this is not a second implementation;
-- it leaves pure-SQL commands (the commit stage) untouched by design.
--
-- sync_automations_to_cron(true) is deliberately NOT called here: it is global
-- and can recreate, re-wrap and unschedule unrelated jobs in the same pass.
DO $sched$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT a.slug, a.schedule,
           a.action->>'jobname' AS jobname,
           public.admin_automation_effective_command(a.slug, a.action->>'command') AS cmd
    FROM public.admin_automations a
    WHERE a.slug IN ('personality_drain_validate','personality_drain_dedup',
                     'personality_drain_review','personality_drain_commit')
  LOOP
    PERFORM cron.schedule(rec.jobname, rec.schedule, rec.cmd);
    RAISE NOTICE 'scheduled % (%) at %', rec.jobname, rec.slug, rec.schedule;
  END LOOP;
END
$sched$;

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS -- assert the state this file exists to reach.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_enabled   int;
  v_scheduled int;
  v_unwrapped int;
  v_probe     jsonb;
BEGIN
  SELECT count(*) INTO v_enabled
  FROM public.admin_automations
  WHERE slug IN ('personality_drain_validate','personality_drain_dedup',
                 'personality_drain_review','personality_drain_commit')
    AND enabled;
  IF v_enabled <> 4 THEN
    RAISE EXCEPTION 'expected 4 enabled personality drain automations, found %', v_enabled;
  END IF;

  SELECT count(*) INTO v_scheduled
  FROM cron.job
  WHERE jobname IN ('personality-drain-validate','personality-drain-dedup',
                    'personality-drain-review','personality-drain-commit')
    AND active;
  IF v_scheduled <> 4 THEN
    RAISE EXCEPTION 'expected 4 active personality drain cron jobs, found %', v_scheduled;
  END IF;

  -- An http drain scheduled with a raw net.http_post runs untracked: no
  -- admin_automation_runs row, consecutive_failures never moves, auto-pause
  -- can never fire. The commit stage is pure SQL and correctly has neither.
  SELECT count(*) INTO v_unwrapped
  FROM cron.job
  WHERE jobname IN ('personality-drain-validate','personality-drain-dedup',
                    'personality-drain-review')
    AND (command NOT LIKE '%admin_automation_run_begin%'
      OR command NOT LIKE '%automation_http_post%'
      OR command LIKE '%net.http_post%');
  IF v_unwrapped <> 0 THEN
    RAISE EXCEPTION '% personality drain cron(s) scheduled unwrapped -- they would run untracked', v_unwrapped;
  END IF;

  -- The sentinel must answer, and must answer with the keys the health check reads.
  v_probe := public.staging_orphan_signals();
  IF v_probe->>'probe_ok' IS DISTINCT FROM 'true'
     OR NOT (v_probe ? 'unconsumed_targets')
     OR NOT (v_probe ? 'orphan_rows_by_target') THEN
    RAISE EXCEPTION 'staging_orphan_signals() did not return the expected shape: %', v_probe;
  END IF;

  RAISE NOTICE 'personality drain chain live; orphan sentinel reports %', v_probe;
END
$verify$;
