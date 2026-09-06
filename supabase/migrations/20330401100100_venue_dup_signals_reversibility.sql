-- Watch reversibility at RUNTIME, not just in the migration file.
--
-- src/lib/__tests__/venueMergeReversibility.test.ts pins what
-- 20330401100000 wrote, and that migration asserts it at deploy time. Neither
-- notices if the LIVE function later drifts from the file — and in this repo
-- that is not hypothetical:
--
--   * _venue_merge_core has been redefined three times already
--     (20260613001000, 20260713183811, 20260801000000), each time a full
--     restatement, which is exactly the shape that drops a clause by accident;
--   * 20260806100000 rescheduled detect_stale_venues and the reschedule never
--     took, so the registry and the live cron disagreed for months while every
--     file in the repo said otherwise (fixed 20260820191944).
--
-- A restatement of _venue_merge_core that forgets the `details` argument is
-- silent: merges keep working, `reparented` still fills, the admin console still
-- shows an Undo button — and every merge from that moment is unrecoverable. The
-- only way to see it is to look at what the merges actually recorded.
--
-- `merges_unreversible_since_fix` counts merges recorded with no schema marker
-- AFTER the first stamped merge exists. It is a HARD failure in
-- check-pipeline-health.mjs, with no baseline allowance, because one such row
-- means the recording stopped.
--
-- Anchored to the fix rather than to a rolling window, and that is a MEASURED
-- choice: 52 merges in the last 7 days predate this migration (40 of them from
-- the 20330101100400 drain hours earlier), so the obvious `last 7 days` rule
-- fires on a correct deploy. That is the same cry-wolf shape the median-vs-oldest
-- fix removed from the backlog warning, one key later.
--
-- `merges_pre_schema_total` reports the historical cohort separately so the
-- number is visible without being alarming — it can only shrink (rows are never
-- backfilled) and it exists so nobody re-discovers it as a fresh problem.

CREATE OR REPLACE FUNCTION public.venue_dup_signals()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_dry jsonb; v_err text := null;
begin
  begin
    v_dry := public.run_dedup_truth_sweep('venue', 'dry_run');
  exception when others then
    v_err := sqlerrm;
    v_dry := null;
  end;

  return jsonb_build_object(
    'would_merge',  (v_dry->>'would_merge')::int,
    'would_queue',  (v_dry->>'would_queue')::int,
    'dry_run_error', v_err,
    'merges_last_7d', (
      select count(*) from public.venue_merge_audit
       where created_at > now() - interval '7 days'),
    'merges_last_30d', (
      select count(*) from public.venue_merge_audit
       where created_at > now() - interval '30 days'),
    -- A merge recorded without the schema marker cannot be undone.
    --
    -- Anchored to the FIRST stamped merge, not to a rolling time window. A
    -- 7-day window was the obvious choice and it is wrong here: measured on
    -- prod at the time of writing, 52 merges in the last 7 days predate this
    -- migration (40 of them from the 20330101100400 drain hours earlier), so a
    -- windowed rule fires on a correct deploy — the same cry-wolf shape the
    -- median-vs-oldest fix removed from the backlog warning.
    --
    -- Once any stamped merge exists, an UNSTAMPED merge after it can only mean
    -- the live _venue_merge_core stopped stamping. Before the first stamped
    -- merge the subquery is NULL, the comparison is NULL, and the count is 0 —
    -- so there is no false-alarm window at all.
    'merges_unreversible_since_fix', (
      select count(*) from public.venue_merge_audit
       where coalesce((details->>'schema')::int, 0) < 1
         and created_at > (select min(created_at) from public.venue_merge_audit
                            where coalesce((details->>'schema')::int, 0) >= 1)),
    'merges_pre_schema_total', (
      select count(*) from public.venue_merge_audit
       where coalesce((details->>'schema')::int, 0) < 1),
    'open_pairs', (
      select count(*) from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    'oldest_open_pair_hours', (
      select round(extract(epoch from (now() - min(created_at))) / 3600)::int
        from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    -- percentile_DISC, not _cont: _cont interpolates and is undefined for
    -- timestamptz (42883). The warning keys on the median, not the oldest —
    -- post-deploy the queue reads 202 open / oldest 424h / median 0h, so a
    -- min()-based rule warns on a correct deploy on every run.
    'median_open_pair_hours', (
      select round(extract(epoch from (
               now() - percentile_disc(0.5) within group (order by created_at)
             )) / 3600)::int
        from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    'open_auto_eligible', (
      select count(*) from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'
         and (cluster->>'auto_eligible')::boolean is true),
    'legacy_automerge_callable', (
      select coalesce(
        has_function_privilege('authenticated',
          'public.run_venue_fuzzy_automerge(boolean,integer)', 'EXECUTE'), false))
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.venue_dup_signals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_dup_signals() TO service_role;

COMMENT ON FUNCTION public.venue_dup_signals() IS
  'Venue dedup health. Hard-fails on: would_merge > 0 with merges_last_7d = 0; '
  'open_auto_eligible > 0; legacy_automerge_callable; dry_run_error set; and '
  'merges_unreversible_since_fix > 0 (a merge recorded with no schema marker cannot be '
  'undone — the live _venue_merge_core has drifted from 20330401100000). Warns on a '
  'deep review backlog by MEDIAN age. merges_pre_schema_total is the frozen count of '
  'rows predating the fix and is informational, not a regression. service_role only.';

DO $verify$
DECLARE v jsonb;
BEGIN
  v := public.venue_dup_signals();
  IF v->>'dry_run_error' IS NOT NULL THEN
    RAISE EXCEPTION 'venue_dup_signals could not take a dry run: %', v->>'dry_run_error';
  END IF;
  IF NOT (v ? 'merges_unreversible_since_fix') OR NOT (v ? 'merges_pre_schema_total') THEN
    RAISE EXCEPTION 'reversibility keys missing from venue_dup_signals: %', v;
  END IF;
  -- Positive control: the pre-schema cohort must be non-zero, or this key is
  -- measuring nothing and would pass on a corpus with no audit rows at all.
  IF (v->>'merges_pre_schema_total')::int = 0 THEN
    RAISE EXCEPTION 'merges_pre_schema_total is 0 — expected the ~1,544 rows predating 20330401100000; the key is not reading the audit table';
  END IF;
  RAISE NOTICE 'venue_dup_signals reversibility keys: unreversible_since_fix=%, pre_schema_total=%',
    v->>'merges_unreversible_since_fix', v->>'merges_pre_schema_total';
END $verify$;
