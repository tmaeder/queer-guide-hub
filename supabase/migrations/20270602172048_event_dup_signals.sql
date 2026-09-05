-- A sentinel for the failure this series exists to fix: an engine that runs,
-- succeeds, and merges nothing.
--
-- There was no health check on event dedup at all. `pipeline_hygiene_stats()` carries
-- `city_dup_signals`; check-pipeline-health.mjs's whole dedup section is city-only
-- (its two `duplicate` hits are both in that block). So the event auto arms could
-- match zero pairs for eleven days while every automation reported success, and
-- nothing anywhere said so.
--
-- WHY A SEPARATE FUNCTION rather than another key on pipeline_hygiene_stats: that
-- function has to be restated in full to add a key, and a restated 140-line function
-- is a merge-collision surface -- two branches adding a key each produce a conflict
-- that resolves by silently dropping one. A standalone function composes.
--
-- WHY IT CALLS THE SWEEP instead of recomputing the arms. The signal that separates
-- "nothing to merge" (healthy) from "cannot see anything to merge" (the bug) is the
-- count of auto-eligible candidates, and re-deriving that here would be a second
-- implementation of the arm ladder, free to drift from the real one. dry_run mode
-- writes nothing and is by construction the same logic the nightly run uses.
--
-- WHAT THIS CAN AND CANNOT CATCH -- stated plainly, because the first draft of this
-- sentinel would have MISSED the incident it was written for. That draft failed on
-- `would_merge > 0 AND merges_last_7d = 0`. Measured against the live broken state,
-- both halves read zero: would_merge=0, merges_last_7d=0, because the arms could not
-- see the 66 duplicates sitting in the queue. A rule keyed on a blocked engine cannot
-- detect a blind one.
--
-- Hard failures (an engine that is demonstrably not doing its job):
--   would_merge > 0 AND merges_last_7d = 0   candidates exist and nothing merges them
--   open_auto_eligible > 0                   an auto pair is stuck in the review queue
--   legacy_sweep_scheduled                   the retired 06:15 merger came back
--   dry_run_error IS NOT NULL                the probe itself is broken
--
-- Warning (needs a human, not a red build):
--   open_pairs / oldest_open_pair_hours      a rotting review backlog. THIS is the
--   signal that would have surfaced the incident: 88 pairs, oldest 653 hours. A deep
--   queue during an import is legitimate and a hard gate here would cry wolf, but a
--   queue that is old AND still growing is how "the arms are mis-specified" actually
--   looks from the outside.
--
-- What no sentinel here can assert is that the arms are WELL-SPECIFIED. That the 66
-- same-instant pairs were genuine duplicates took a human reading rows. This function
-- makes the backlog visible; it does not make the judgement.

CREATE OR REPLACE FUNCTION public.event_dup_signals()
 RETURNS jsonb
 LANGUAGE plpgsql
 -- VOLATILE, not STABLE. dry_run writes nothing, but run_dedup_truth_sweep is
 -- volatile and declaring this STABLE would be a promise about a function it does
 -- not control -- the planner may then cache or reorder a call that reads the
 -- review queue and the audit table.
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v_dry jsonb; v_err text := null;
begin
  begin
    v_dry := public.run_dedup_truth_sweep('event', 'dry_run');
  exception when others then
    v_err := sqlerrm;
    v_dry := null;
  end;

  return jsonb_build_object(
    -- Null, not zero, when the dry run could not be taken. "Could not look" and
    -- "looked and found none" must stay distinguishable, or a broken probe reads
    -- as a clean corpus.
    'would_merge',  (v_dry->>'would_merge')::int,
    'would_queue',  (v_dry->>'would_queue')::int,
    'dry_run_error', v_err,
    'merges_last_7d', (
      select count(*) from public.entity_merge_audit
       where entity_type = 'event' and created_at > now() - interval '7 days'),
    'merges_last_30d', (
      select count(*) from public.entity_merge_audit
       where entity_type = 'event' and created_at > now() - interval '30 days'),
    'open_pairs', (
      select count(*) from public.dedup_review_queue
       where entity_type = 'event' and status = 'open'),
    'oldest_open_pair_hours', (
      select round(extract(epoch from (now() - min(created_at))) / 3600)::int
        from public.dedup_review_queue
       where entity_type = 'event' and status = 'open'),
    'open_auto_eligible', (
      -- An auto-eligible pair still sitting open means the merge branch is not
      -- reaching it: mode flipped off full, the merge cap is biting, or merges are
      -- throwing and being counted as skips.
      select count(*) from public.dedup_review_queue
       where entity_type = 'event' and status = 'open'
         and (cluster->>'auto_eligible')::boolean is true),
    'legacy_sweep_scheduled', (
      -- 20270602171846 retired it. If it comes back, something rescheduled a merger
      -- that ignores human rejections.
      select count(*) > 0 from cron.job where jobname = 'event_dedup_sweep')
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.event_dup_signals() FROM public;
GRANT EXECUTE ON FUNCTION public.event_dup_signals() TO authenticated, service_role;

COMMENT ON FUNCTION public.event_dup_signals() IS
  'Event dedup health. Hard-fails on: would_merge > 0 with merges_last_7d = 0 (candidates exist, nothing merges them); open_auto_eligible > 0 (auto pair stuck in review); legacy_sweep_scheduled (the retired 06:15 merger returned); dry_run_error set (probe broken). Warns on a deep or old review backlog. would_merge is NULL rather than 0 when the dry run failed -- "could not look" is not "found none". Cannot assert the arms are well specified; that needs a human reading rows.';

DO $verify$
DECLARE v jsonb;
BEGIN
  v := public.event_dup_signals();
  IF v->>'dry_run_error' IS NOT NULL THEN
    RAISE EXCEPTION 'event_dup_signals could not take a dry run: %', v->>'dry_run_error';
  END IF;
  IF (v->>'would_merge') IS NULL THEN
    RAISE EXCEPTION 'event_dup_signals returned a null would_merge with no error -- the probe is broken';
  END IF;
  RAISE NOTICE 'event_dup_signals: %', v;
END $verify$;
