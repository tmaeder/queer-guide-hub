-- staging_orphan_signals(): measure the CONSUMER, not the residue.
--
-- Shipped in 99950101100000 and wrong within the hour, on live data.
--
-- `unconsumed_targets` was derived from `max(ingestion_events.created_at)`
-- joined against THE ORPHAN SET. But a row the drain has advanced stops being
-- an orphan — it is no longer `ai_validation_status='pending'`. So the rows
-- remaining in the set are, by construction, exactly the ones the drain has not
-- reached yet, and they have no events. The measure reads "nothing is consuming
-- this" for as long as any backlog remains, no matter how fast it is draining.
--
-- Measured on prod 2026-09-19 07:31, one hour after the city drain chain went
-- live and one full cycle (normalize 100 -> validate 100 -> dedup 100 ->
-- commit 100) had visibly completed:
--
--   progress measured ON THE ORPHANS ....... 0      -> hard fail
--   events for target_table 'cities' in 24h . 400    -> a drain is plainly working
--
-- That is the exact false alarm 50000101100000's own header promised to avoid:
-- "a backlog with a working consumer is throughput and must not page anyone".
-- A gate that fires through the whole drain is a gate people learn to ignore,
-- which is how the 3,500-row warn floor it replaced came to mean nothing.
--
-- The question the key exists to answer is "does a consumer exist for this
-- target_table at all", and that is a property of the TABLE, not of whichever
-- rows happen to still be waiting. So `consumers` is computed over every
-- staging row of the table, independent of the orphan set.
--
-- What this deliberately does NOT change: the orphan predicate itself (no run
-- id / missing run / terminal run, and no normalized_data requirement) and the
-- 48h floor. Only the consumer test moves.

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
      AND (
        s.pipeline_run_id IS NULL
        OR r.id IS NULL
        OR r.status IN ('failed', 'cancelled', 'completed')
      )
  ),
  per_target AS (
    SELECT o.target_table,
           count(DISTINCT o.id) AS rows,
           min(o.created_at)    AS oldest
    FROM orphans o
    GROUP BY o.target_table
  ),
  -- Over EVERY staging row of the table, not the orphan subset. An advanced row
  -- leaves the orphan set, so scoping this there makes a working drain look
  -- dead for the whole duration of the backlog.
  consumers AS (
    SELECT s.target_table, max(e.created_at) AS last_advance
    FROM public.ingestion_events e
    JOIN public.ingestion_staging s ON s.id = e.staging_id
    WHERE e.created_at > now() - interval '24 hours'
    GROUP BY s.target_table
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
    'orphan_reasons_by_target',
      COALESCE((SELECT jsonb_object_agg(target_table, rs) FROM (
         SELECT target_table, jsonb_object_agg(reason, n) AS rs
         FROM per_reason GROUP BY target_table) z), '{}'::jsonb),
    -- Hard-fail key: orphans exist for this target_table AND no row of that
    -- table advanced a stage in 24h, i.e. there is no consumer at all.
    'unconsumed_targets',
      COALESCE((SELECT jsonb_agg(p.target_table ORDER BY p.target_table)
                FROM per_target p
                LEFT JOIN consumers c ON c.target_table = p.target_table
                WHERE c.last_advance IS NULL), '[]'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.staging_orphan_signals() IS
  'Staging rows no DAG-scoped stage can reach: no run id, a missing run, or a run in a '
  'terminal status. Stages filter on the CURRENT run id, so a dead run owning a row hides it '
  'from every per-run view while the row is as stranded as an unclaimed one. Deliberately does '
  'NOT require normalized_data — a row stuck before normalize is stranded too. '
  'unconsumed_targets asks whether a consumer exists for the TARGET TABLE, measured over every '
  'staging row of that table: an advanced row leaves the orphan set, so measuring progress on '
  'the residue reports a working drain as dead for the whole life of the backlog.';

REVOKE ALL ON FUNCTION public.staging_orphan_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_orphan_signals() TO service_role;

DO $verify$
DECLARE v_probe jsonb;
BEGIN
  v_probe := public.staging_orphan_signals();
  IF v_probe->>'probe_ok' IS DISTINCT FROM 'true'
     OR NOT (v_probe ? 'unconsumed_targets')
     OR NOT (v_probe ? 'orphan_reasons_by_target') THEN
    RAISE EXCEPTION 'staging_orphan_signals() shape regressed: %', v_probe;
  END IF;

  -- The defect this migration exists to fix, asserted rather than trusted: a
  -- target_table whose rows ARE advancing must not appear in unconsumed_targets.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_probe->'unconsumed_targets') t(tbl)
    WHERE EXISTS (
      SELECT 1 FROM public.ingestion_events e
      JOIN public.ingestion_staging s ON s.id = e.staging_id
      WHERE s.target_table = t.tbl AND e.created_at > now() - interval '24 hours'
    )
  ) THEN
    RAISE EXCEPTION 'unconsumed_targets still names a target_table that is actively advancing: %', v_probe;
  END IF;

  RAISE NOTICE 'orphan sentinel now measures the consumer: %', v_probe;
END
$verify$;
