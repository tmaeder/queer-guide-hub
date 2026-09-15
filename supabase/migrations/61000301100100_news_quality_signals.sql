-- ============================================================================
-- Sentinel for the news quality drain. The fault it watches for is not depth --
-- it is a drain that CANNOT REACH its own queue while reporting success.
-- ----------------------------------------------------------------------------
-- `news_verdict_geo_backfill` (*/10) posts action=enqueue then action=run and
-- records a successful run either way. On 2026-09-14 it had been doing that
-- against an enqueue selector returning ZERO rows corpus-wide, with 782 items
-- showing in /admin/inbox and 346 of them never judged at all. Nothing anywhere
-- said so: `last_run_status` was 'success', consecutive_failures 0, and the
-- queue depth alone cannot tell a backlog being worked from one nothing can
-- touch. Same shape as `would_merge: 0` on the dedup engines -- an engine that
-- matches nothing looks exactly like an engine with nothing to do.
--
-- WHAT IS HARD-FAILED, AND WHY IT IS THIS AND NOT THE DEPTH.
--
--   unjudged_unreachable -- rows in the review queue that carry NO verdict and
--   that the enqueue selector will not offer (and are not already in flight).
--   That is the lockout exactly: a human is being asked to decide something no
--   machine ever looked at, and the queue row shows nothing to decide from.
--
--   THE FIRST DRAFT OF THIS GATE WAS VACUOUS AND THE DRY RUN IS WHAT CAUGHT IT.
--   It also required "no attempt at or after attempt_epoch", reasoning that a row
--   the drain had genuinely tried and failed should not pin CI red. But with the
--   epoch unset every attempt ever made counts as "since the epoch", so against
--   the real incident -- 346 unjudged rows, 0 eligible corpus-wide -- it read
--   ONE. The gate would have stayed green through the exact fault it was written
--   for. Reading the code could not show that; running it against prod did.
--
--   Dropping that clause is the right trade and not merely the convenient one. A
--   row that has exhausted its post-epoch attempts is in the SAME state as a
--   locked-out one -- unjudged, unreachable, parked in front of a human -- and
--   the correct response is the same: either forgive the attempts because the
--   cause was ours (move the epoch) or disposition the row. What must not happen
--   is that it sits in a human queue forever with nothing behind it. So the gate
--   firing there is correct, not noise.
--
--   A depth rule would do the opposite. judged_in_review is a real human queue
--   (436 rows at time of writing, each with a verdict, a confidence and a stated
--   blocked reason) and no number of them is a fault; it is reported and never
--   gates.
--
-- probe_ok is reported SEPARATELY from every count, because an empty corpus, a
-- revoked grant and a clean queue otherwise all return the same reassuring zero
-- -- the lesson `accessibility_contradictions` and `tag_disowned_prose_signals`
-- both had to learn. A caller that cannot read the counts must not read as
-- clean, so check-pipeline-health treats a missing RPC as a hard failure.
--
-- STANDALONE, not a key on pipeline_hygiene_stats(): that body is long and
-- re-stating it to add a counter is a merge-collision surface. Same reasoning as
-- geo_dedup_signals / tag_merge_graph_signals / news_image_signals.
--
-- service_role ONLY. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.news_quality_signals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_epoch       timestamptz;
  v_unjudged    int;
  v_judged      int;
  v_eligible    int;
  v_attempted   int;
  v_unreachable int;
  v_in_search   int;
  v_stale_image int;
BEGIN
  SELECT attempt_epoch INTO v_epoch FROM public.news_quality_settings WHERE id = 1;

  SELECT count(*) FILTER (WHERE quality_decision IS NULL),
         count(*) FILTER (WHERE quality_decision IS NOT NULL)
    INTO v_unjudged, v_judged
  FROM public.news_articles
  WHERE quality_status = 'review';

  SELECT count(*) INTO v_eligible
  FROM public.news_quality_enqueue_candidates(200000, 3);

  -- Context only: how many unjudged rows the drain has tried under this epoch.
  SELECT count(*) INTO v_attempted
  FROM public.news_articles a
  WHERE a.quality_status = 'review' AND a.quality_decision IS NULL
    AND EXISTS (
      SELECT 1 FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id
        AND j.created_at >= coalesce(v_epoch, '-infinity'::timestamptz));

  -- THE GATE: no verdict, and the drain will not offer it. In flight counts as
  -- reachable -- a claimed job is about to produce a verdict, and treating it as
  -- unreachable would make the signal flap against the */10 cron.
  SELECT count(*) INTO v_unreachable
  FROM public.news_articles a
  WHERE a.quality_status = 'review' AND a.quality_decision IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.news_quality_enqueue_candidates(200000, 3) c
      WHERE c.id = a.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id AND j.status IN ('pending', 'running'));

  -- Invariant, reported so it cannot rot silently: a row awaiting review is not
  -- served. Measured 0 of 782 on 2026-09-14.
  SELECT count(*) INTO v_in_search
  FROM public.news_articles a
  WHERE a.quality_status = 'review'
    AND EXISTS (SELECT 1 FROM public.search_documents sd
                WHERE sd.entity_type = 'news' AND sd.entity_id = a.id);

  -- Advisory: blocked on an image that no longer exists. The 2026-09-08 podcast
  -- repair NULLed image_url on rows whose "image" was really episode audio, and
  -- nothing re-judges a row that already carries a pipeline version, so the
  -- stated reason outlived the thing it described.
  SELECT count(*) INTO v_stale_image
  FROM public.news_articles
  WHERE quality_status = 'review'
    AND 'image_unusable' = ANY(auto_publish_blocked_reasons)
    AND image_url IS NULL;

  RETURN jsonb_build_object(
    'probe_ok', true,
    'attempt_epoch', v_epoch,
    'unjudged_in_review', v_unjudged,
    'judged_in_review', v_judged,
    'eligible_now', v_eligible,
    'attempted_since_epoch', v_attempted,
    'unjudged_unreachable', v_unreachable,
    'review_rows_in_search', v_in_search,
    'stale_image_block', v_stale_image
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('probe_ok', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.news_quality_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.news_quality_signals() TO service_role;

COMMENT ON FUNCTION public.news_quality_signals() IS
  'Health of the news quality drain. unjudged_unreachable is the gate: rows in '
  'review with no verdict that the enqueue selector will not offer and that are '
  'not in flight. Depth (judged_in_review) is a human queue and never gates. '
  'Read probe_ok before any count.';

DO $verify$
DECLARE v jsonb;
BEGIN
  v := public.news_quality_signals();
  IF (v->>'probe_ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'news_quality_signals could not probe: %', v->>'error';
  END IF;
  -- A signal that reports nothing is not a signal. Assert the keys the health
  -- script reads exist, rather than asserting counts that drift with inflow.
  IF NOT (v ? 'unjudged_unreachable' AND v ? 'eligible_now'
          AND v ? 'unjudged_in_review' AND v ? 'attempt_epoch') THEN
    RAISE EXCEPTION 'news_quality_signals is missing a key the health check reads: %', v;
  END IF;
  RAISE NOTICE 'news_quality_signals: %', v;
END $verify$;
