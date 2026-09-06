-- A sentinel for the failure 20330101100100 exists to fix: an engine that runs,
-- succeeds, and merges nothing.
--
-- There was no health check on VENUE dedup at all. check-pipeline-health.mjs
-- covers city (block 4a) and, since 20270822093816, event (4b). Venues had
-- neither, which is precisely why the auto arms could match zero pairs while
-- admin_automations reported `dedup_truth_sweep` successful every night at 05:50
-- with consecutive_failures = 0, and 530 pairs aged in the review queue for
-- 43 days without anything saying so.
--
-- WHY A SEPARATE FUNCTION rather than another key on pipeline_hygiene_stats:
-- that function must be restated in full to add a key, and a restated 140-line
-- function is a merge-collision surface -- two branches each adding a key produce
-- a conflict that resolves by silently dropping one. A standalone function
-- composes. Same reasoning as event_dup_signals.
--
-- WHY IT CALLS THE SWEEP instead of recomputing the arms: the quantity that
-- separates "nothing to merge" (healthy) from "cannot SEE anything to merge"
-- (the bug) is the count of auto-eligible candidates, and re-deriving it here
-- would be a second implementation of the ladder, free to drift from the real
-- one. dry_run writes nothing and is by construction the same logic the nightly
-- run uses.
--
-- WHAT THIS CAN AND CANNOT CATCH. Stated plainly, because the obvious rule --
-- `would_merge > 0 AND merges_last_7d = 0` -- would have MISSED the incident it
-- is written for. Measured against the live broken state on 2026-09-06, both
-- halves read zero: would_merge = 0 because the arms could not see the
-- duplicates, and merges_last_7d = 0 because none happened. A rule keyed on a
-- BLOCKED engine cannot detect a BLIND one.
--
-- Hard failures (an engine demonstrably not doing its job):
--   would_merge > 0 AND merges_last_7d = 0   candidates exist and nothing merges them
--   open_auto_eligible > 0                   an auto pair stuck in the review queue
--   legacy_automerge_callable                run_venue_fuzzy_automerge re-granted
--                                            (retired 20330101100300: no rejection memory)
--   dry_run_error IS NOT NULL                the probe itself is broken
--
-- Warning (needs a human, not a red build):
--   open_pairs / median_open_pair_hours      a rotting review backlog. THIS is the
--   signal that would actually have surfaced the incident -- 530 pairs whose
--   MEDIAN age was around 1,000 hours -- and it is a warning because a deep queue
--   during an import is legitimate, while a queue that is old AND still growing is
--   what "the arms are mis-specified" looks like from outside.
--
--   It keys on the median and NOT on oldest_open_pair_hours, which is reported for
--   information only. Measured on the post-deploy state: 202 open, oldest 424h,
--   median ~0h -- because 200 rows were just re-queued by the new arms and the two
--   stragglers are hand-annotated rows deliberately left for a human. A min()-based
--   rule fires there, on a correct deploy, and a warning that is always on is one
--   people learn to scroll past.
--
-- What no sentinel here can assert is that the arms are WELL-SPECIFIED. That the
-- 145 same-address pairs are genuine duplicates took a human reading 106 rows.
-- This function makes the backlog visible; it does not make the judgement.
--
-- SERVICE_ROLE ONLY from the start. Its event twin (20270822093816) shipped
-- granted to `authenticated, service_role` and had to be narrowed afterwards by
-- 20280301104412, which is where the reasoning below is set out. (That file's own
-- header credits an earlier `20280301093500` with closing the anon grant; no such
-- version exists as a file OR in schema_migrations, checked 2026-09-06, so it is
-- not repeated here as if it were real.) The reasoning applies verbatim: this is
-- SECURITY DEFINER so RLS does
-- not apply to what it reads, it surfaces dedup_review_queue and merge-audit
-- contents (moderation-internal), and it runs a full sweep per call on a
-- disk-constrained instance -- a cheap denial of service. `authenticated` is every
-- account on this platform, not staff. The only caller is
-- scripts/check-pipeline-health.mjs, which authenticates with the service role.

CREATE OR REPLACE FUNCTION public.venue_dup_signals()
 RETURNS jsonb
 LANGUAGE plpgsql
 -- VOLATILE, not STABLE. dry_run writes nothing, but run_dedup_truth_sweep is
 -- volatile and declaring this STABLE would be a promise about a function it does
 -- not control -- the planner could then cache or reorder a call that reads the
 -- review queue and the audit table.
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
    -- Null, not zero, when the dry run could not be taken. "Could not look" and
    -- "looked and found none" must stay distinguishable, or a broken probe reads
    -- as a clean corpus.
    'would_merge',  (v_dry->>'would_merge')::int,
    'would_queue',  (v_dry->>'would_queue')::int,
    'dry_run_error', v_err,
    -- Venue merges audit into venue_merge_audit, NOT entity_merge_audit --
    -- approve_dedup_review dispatches per type and only venue/city have their own
    -- audit tables (20260725204000). Counting the wrong table here would report
    -- zero merges forever and hard-fail on a healthy engine.
    'merges_last_7d', (
      select count(*) from public.venue_merge_audit
       where created_at > now() - interval '7 days'),
    'merges_last_30d', (
      select count(*) from public.venue_merge_audit
       where created_at > now() - interval '30 days'),
    'open_pairs', (
      select count(*) from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    'oldest_open_pair_hours', (
      select round(extract(epoch from (now() - min(created_at))) / 3600)::int
        from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    -- The MEDIAN, and the backlog warning keys on this rather than on the oldest.
    -- Measured: immediately after a correct deploy the queue reads 202 open with
    -- oldest = 424h -- 200 rows freshly re-queued by the new arms plus the 2
    -- hand-annotated rows from 2026-08-19 that are deliberately left for the human
    -- who wrote them. A min()-based rule therefore fires on a healthy engine, and a
    -- warning that is always on is one people learn to scroll past. The median
    -- separates the two states cleanly: ~0h here, ~1,000h in the broken state this
    -- sentinel exists to surface. Two old stragglers cannot move it; a genuinely
    -- abandoned queue cannot hide from it.
    -- percentile_DISC, not _cont: percentile_cont interpolates and is only defined
    -- for numeric/interval inputs, so `percentile_cont(0.5) ... order by created_at`
    -- fails with 42883 on a timestamptz. _disc picks an actual row, which is what
    -- "the median pair's age" means anyway.
    'median_open_pair_hours', (
      select round(extract(epoch from (
               now() - percentile_disc(0.5) within group (order by created_at)
             )) / 3600)::int
        from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'),
    'open_auto_eligible', (
      -- An auto-eligible pair still sitting open means the merge branch is not
      -- reaching it: mode flipped off full, the merge cap is biting, or merges are
      -- throwing and being counted as skips.
      select count(*) from public.dedup_review_queue
       where entity_type = 'venue' and status = 'open'
         and (cluster->>'auto_eligible')::boolean is true),
    'legacy_automerge_callable', (
      -- 20330101100300 retired it by revoking the grant (it has no cron and no
      -- registry row). A re-grant is the only way it comes back, so that is what
      -- this watches -- the venue analogue of event's legacy_sweep_scheduled.
      select coalesce(
        has_function_privilege('authenticated',
          'public.run_venue_fuzzy_automerge(boolean,integer)', 'EXECUTE'), false))
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.venue_dup_signals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_dup_signals() TO service_role;

COMMENT ON FUNCTION public.venue_dup_signals() IS
  'Venue dedup health. Hard-fails on: would_merge > 0 with merges_last_7d = 0 '
  '(candidates exist, nothing merges them); open_auto_eligible > 0 (auto pair stuck in '
  'review); legacy_automerge_callable (run_venue_fuzzy_automerge re-granted); '
  'dry_run_error set (probe broken). Warns on a deep or old review backlog -- which is '
  'the only one of these that would have caught the 2026-09 incident, since a BLIND '
  'engine reads would_merge=0 and merges_7d=0 simultaneously. would_merge is NULL rather '
  'than 0 when the dry run failed. Cannot assert the arms are well specified; that needs '
  'a human reading rows. service_role only: SECURITY DEFINER, moderation-internal data, '
  'and one call runs a full sweep.';

DO $verify$
DECLARE v jsonb; v_anon boolean; v_authed boolean;
BEGIN
  v := public.venue_dup_signals();
  IF v->>'dry_run_error' IS NOT NULL THEN
    RAISE EXCEPTION 'venue_dup_signals could not take a dry run: %', v->>'dry_run_error';
  END IF;
  IF (v->>'would_merge') IS NULL THEN
    RAISE EXCEPTION 'venue_dup_signals returned a null would_merge with no error -- the probe is broken';
  END IF;

  SELECT has_function_privilege('anon', 'public.venue_dup_signals()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.venue_dup_signals()', 'EXECUTE')
    INTO v_anon, v_authed;
  IF v_anon OR v_authed THEN
    RAISE EXCEPTION 'venue_dup_signals is reachable by anon/authenticated -- it is SECURITY DEFINER and runs a full sweep per call';
  END IF;

  RAISE NOTICE 'venue_dup_signals: %', v;
END $verify$;
