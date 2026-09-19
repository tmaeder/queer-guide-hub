-- City staging drain chain + the two blind spots the personality sentinel had.
--
-- WHAT THIS FOUND
--
-- `city-ingestion` is a WEEKLY DAG. Its 2026-09-13 run failed twice — once at
-- `pipeline-deduplicate` with HTTP 546 (the edge wall clock) after 1,000 items,
-- once at `pipeline-quality-score` with a statement timeout — and left 1,000
-- staging rows behind. Last completed run: 2026-09-06.
--
-- Nothing can resume them. Every DAG-scoped stage filters
-- `.eq('pipeline_run_id', <current run>)`, so rows stamped with the id of a
-- DEAD run are exactly as unreachable as rows with no id at all, and cities
-- have no dual-mode drain. Measured on 2026-09-19:
--
--   500  ai_validation_status=pending, normalized_data IS NULL  (never normalized)
--   311  approved / dedup=duplicate / review=auto               } commit-eligible
--    53  approved / dedup=unique     / review=approved          } = 364 rows
--   136  approved / dedup=pending    / review=approved
--   ---
--  1000  every one of them disposition='pending', 0 committed
--
-- **189 of those carry HUMAN review decisions** (stage='review', actor = a real
-- user uuid, 163 of them on 2026-09-15). Someone worked that queue and not one
-- decision reached a row. This is the failure class CLAUDE.md records at length
-- for `ai_validation_status`, arriving through a different door: here the
-- statuses are right and there is simply no consumer.
--
-- `commit_city_staging_batch` exists, takes NO run id, and has **zero callers**
-- — not in `admin_automations`, not in `cron.job`. Dry-run on prod in a
-- rolled-back transaction: 50 rows -> 48 updated, 2 inserted.
--
-- PART A — the sentinel had TWO blind spots, and this incident sat in both
--
-- `staging_orphan_signals()` (migration 50000101100000) predicated on
-- `pipeline_run_id IS NULL`. These rows carry an id, so it reported cities as
-- clean while 1,000 rows were stranded. Worse, it also required
-- `normalized_data IS NOT NULL` — mirroring pipeline-validate's selector — and
-- 500 of the cohort are stuck BEFORE normalize, so they failed that test too.
-- Either blind spot alone would have hidden this.
--
--   unreachable := pipeline_run_id IS NULL          -- never entered a run
--                  OR the run row is gone
--                  OR the run reached a terminal status
--
-- A terminal status includes 'completed', not just 'failed': a run that
-- finished without processing everything leaves the remainder just as
-- unreachable, and the 48h staleness floor keeps genuine in-flight work out.
-- Rows belonging to a RUNNING run are deliberately not flagged.
--
-- Measured before writing this, across every target_table: the widened
-- predicate matches 500 rows, all `cities`, all `run_failed`. It fires on the
-- defect and on nothing else — no baseline, no threshold, no allowance.
--
-- PART B — the drain chain cities never had
--
-- Five stages, not four: unlike personalities (whose rows arrive normalized
-- from a SQL insert), half this cohort has `normalized_data IS NULL`, so the
-- chain starts at normalize. `pipeline-normalize` and `pipeline-review-gate`
-- take `entityType` ONLY; `pipeline-validate` and `pipeline-deduplicate` take
-- `targetTable`. All 1,000 rows carry entity_type='city' (measured, 0 NULL),
-- so both keys address the cohort — but each stage is given the key it
-- actually reads rather than the one that reads better.
--
-- Batch 100 everywhere, against the 1,000 that killed the DAG in one pass.

-- ---------------------------------------------------------------------------
-- PART A
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staging_orphan_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH orphans AS (
    SELECT s.id,
           s.target_table,
           s.created_at,
           CASE
             WHEN s.pipeline_run_id IS NULL THEN 'no_run_id'
             WHEN r.id IS NULL              THEN 'run_missing'
             ELSE 'run_' || r.status
           END AS reason
    FROM public.ingestion_staging s
    LEFT JOIN public.pipeline_runs r ON r.id = s.pipeline_run_id
    WHERE s.ai_validation_status = 'pending'
      AND s.disposition = 'pending'
      AND s.created_at < now() - interval '48 hours'
      -- Unreachable by every DAG-scoped stage. NOT restricted to
      -- normalized_data IS NOT NULL: a row stranded BEFORE normalize is
      -- stranded too, and that condition hid 500 of the cities cohort.
      AND (
        s.pipeline_run_id IS NULL
        OR r.id IS NULL
        OR r.status IN ('failed', 'cancelled', 'completed')
      )
  ),
  per_target AS (
    SELECT o.target_table,
           count(DISTINCT o.id) AS rows,
           min(o.created_at)    AS oldest,
           max(e.created_at)    AS last_advance
    FROM orphans o
    LEFT JOIN public.ingestion_events e
           ON e.staging_id = o.id
          AND e.created_at > now() - interval '24 hours'
    GROUP BY o.target_table
  ),
  per_reason AS (
    SELECT target_table, reason, count(*) AS n
    FROM orphans GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'probe_ok', true,
    'orphan_rows_by_target',
      COALESCE((SELECT jsonb_object_agg(target_table, rows) FROM per_target), '{}'::jsonb),
    'oldest_orphan_days',
      COALESCE((SELECT jsonb_object_agg(target_table,
                 round(extract(epoch FROM now() - oldest) / 86400.0)::int)
                FROM per_target), '{}'::jsonb),
    -- Why each cohort is unreachable. 'no_run_id' means nothing ever claimed
    -- it; 'run_failed'/'run_completed' means a dead run still owns it, which
    -- reads as healthy from every per-run view.
    'orphan_reasons_by_target',
      COALESCE((SELECT jsonb_object_agg(target_table, rs) FROM (
         SELECT target_table, jsonb_object_agg(reason, n) AS rs
         FROM per_reason GROUP BY target_table) z), '{}'::jsonb),
    'unconsumed_targets',
      COALESCE((SELECT jsonb_agg(target_table ORDER BY target_table)
                FROM per_target WHERE last_advance IS NULL), '[]'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.staging_orphan_signals() IS
  'Staging rows no DAG-scoped stage can reach: no run id, a missing run, or a run in a '
  'terminal status. Stages filter on the CURRENT run id, so a dead run owning a row hides it '
  'from every per-run view while the row is as stranded as an unclaimed one. Deliberately does '
  'NOT require normalized_data — a row stuck before normalize is stranded too. '
  'unconsumed_targets lists target_tables whose stale orphans had NO ingestion_events advance '
  'in 24h, i.e. no dual-mode drain is consuming them.';

REVOKE ALL ON FUNCTION public.staging_orphan_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_orphan_signals() TO service_role;

-- ---------------------------------------------------------------------------
-- PART B
-- ---------------------------------------------------------------------------

-- Each stage is CLONED from a working twin so the url, anon bearer and vault
-- lookup are copied rather than re-typed. Soft on preconditions: a concurrent
-- session may have created one already.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT 'city_drain_normalize', 'city-drain-normalize',
       'City staging drain stage. Hourly: normalizes city rows stranded outside a live DAG run. '
       'Cities need this stage (personalities do not) because half the 2026-09-13 cohort has '
       'normalized_data IS NULL — the weekly DAG died before reaching them.',
       'system', true, '{"type": "schedule"}'::jsonb,
       jsonb_build_object('type','cron','jobname','city-drain-normalize',
         'command', replace(v.action->>'command', '"entityType":"event"', '"entityType":"city"')),
       '4 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'ev_drain_normalize'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug='city_drain_normalize');

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT 'city_drain_validate', 'city-drain-validate',
       'City staging drain stage. Hourly: validates city rows whose pipeline_run_id points at a '
       'dead run, which every DAG-scoped stage filters away.',
       'system', true, '{"type": "schedule"}'::jsonb,
       jsonb_build_object('type','cron','jobname','city-drain-validate',
         'command', replace(v.action->>'command', '"targetTable":"personalities"', '"targetTable":"cities"')),
       '9 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'personality_drain_validate'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug='city_drain_validate');

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT 'city_drain_dedup', 'city-drain-dedup',
       'City staging drain stage. Hourly: deduplicates validated city rows. Not optional — '
       'commit_city_staging_batch requires dedup_status IN (unique,duplicate,merge_candidate), '
       'so rows left at pending are never committed.',
       'system', true, '{"type": "schedule"}'::jsonb,
       jsonb_build_object('type','cron','jobname','city-drain-dedup',
         'command', replace(v.action->>'command', '"targetTable":"personalities"', '"targetTable":"cities"')),
       '14 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'personality_drain_dedup'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug='city_drain_dedup');

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT 'city_drain_review', 'city-drain-review',
       'City staging drain stage. Hourly: routes city rows through the review gate so '
       'low-confidence rows reach a human instead of committing unexamined.',
       'system', true, '{"type": "schedule"}'::jsonb,
       jsonb_build_object('type','cron','jobname','city-drain-review',
         'command', replace(v.action->>'command', '"entityType":"venue"', '"entityType":"city"')),
       '19 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'vn_drain_review'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug='city_drain_review');

INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, action, schedule)
SELECT 'city_drain_commit', 'city-drain-commit',
       'City staging drain stage. Hourly: commits city rows that cleared validate/dedup/review. '
       'commit_city_staging_batch had ZERO callers anywhere before this row — the only path was '
       'the DAG commit node, which filters on a run id that is dead.',
       'system', true, '{"type": "schedule"}'::jsonb,
       jsonb_build_object('type','cron','jobname','city-drain-commit',
         'command', replace(v.action->>'command', 'commit_venue_staging_batch', 'commit_city_staging_batch')),
       '24 * * * *'
FROM public.admin_automations v
WHERE v.slug = 'vn_drain_commit'
  AND NOT EXISTS (SELECT 1 FROM public.admin_automations x WHERE x.slug='city_drain_commit');

-- Schedule with the WRAPPED form. A cron installed by a migration carries the
-- RAW command and runs untracked until the nightly 05:10 reconciler rewrites
-- it: no admin_automation_runs row, consecutive_failures never moves,
-- auto-pause cannot fire. admin_automation_effective_command() is the same
-- derivation sync_automations_to_cron() applies and leaves pure-SQL commands
-- (the commit stage) untouched by design.
--
-- sync_automations_to_cron(true) is deliberately NOT called: it is global and
-- can recreate, re-wrap and unschedule unrelated jobs in the same pass.
DO $sched$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT a.slug, a.schedule, a.action->>'jobname' AS jobname,
           public.admin_automation_effective_command(a.slug, a.action->>'command') AS cmd
    FROM public.admin_automations a
    WHERE a.slug IN ('city_drain_normalize','city_drain_validate','city_drain_dedup',
                     'city_drain_review','city_drain_commit')
  LOOP
    PERFORM cron.schedule(rec.jobname, rec.schedule, rec.cmd);
    RAISE NOTICE 'scheduled % (%) at %', rec.jobname, rec.slug, rec.schedule;
  END LOOP;
END
$sched$;

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_enabled int; v_cron int; v_unwrapped int; v_probe jsonb;
BEGIN
  SELECT count(*) INTO v_enabled FROM public.admin_automations
   WHERE slug LIKE 'city_drain_%' AND enabled;
  IF v_enabled <> 5 THEN
    RAISE EXCEPTION 'expected 5 enabled city drain automations, found %', v_enabled;
  END IF;

  SELECT count(*) INTO v_cron FROM cron.job
   WHERE jobname LIKE 'city-drain-%' AND active;
  IF v_cron <> 5 THEN
    RAISE EXCEPTION 'expected 5 active city drain cron jobs, found %', v_cron;
  END IF;

  -- The four http stages must be wrapped or they run untracked. The commit
  -- stage is pure SQL (family C) and correctly carries neither marker.
  SELECT count(*) INTO v_unwrapped FROM cron.job
   WHERE jobname IN ('city-drain-normalize','city-drain-validate','city-drain-dedup','city-drain-review')
     AND (command NOT LIKE '%admin_automation_run_begin%'
       OR command NOT LIKE '%automation_http_post%'
       OR command LIKE '%net.http_post%');
  IF v_unwrapped <> 0 THEN
    RAISE EXCEPTION '% city drain cron(s) scheduled unwrapped — they would run untracked', v_unwrapped;
  END IF;

  -- Each stage must carry the scoping key the function it calls actually reads:
  -- normalize/review take entityType only, validate/dedup take targetTable.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname IN ('city-drain-normalize','city-drain-review')
               AND command NOT LIKE '%"entityType":"city"%') THEN
    RAISE EXCEPTION 'normalize/review drain is not scoped by entityType=city';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname IN ('city-drain-validate','city-drain-dedup')
               AND command NOT LIKE '%"targetTable":"cities"%') THEN
    RAISE EXCEPTION 'validate/dedup drain is not scoped by targetTable=cities';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='city-drain-commit'
                   AND command LIKE '%commit_city_staging_batch%') THEN
    RAISE EXCEPTION 'commit drain does not call commit_city_staging_batch';
  END IF;

  v_probe := public.staging_orphan_signals();
  IF v_probe->>'probe_ok' IS DISTINCT FROM 'true'
     OR NOT (v_probe ? 'unconsumed_targets')
     OR NOT (v_probe ? 'orphan_reasons_by_target') THEN
    RAISE EXCEPTION 'staging_orphan_signals() did not return the expected shape: %', v_probe;
  END IF;

  RAISE NOTICE 'city drain chain live; orphan sentinel reports %', v_probe;
END
$verify$;
