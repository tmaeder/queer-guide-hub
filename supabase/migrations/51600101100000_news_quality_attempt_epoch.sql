-- ============================================================================
-- The news quality drain could not reach its own backlog, and reported success
-- every ten minutes while it did nothing.
-- ----------------------------------------------------------------------------
-- MEASURED ON PROD 2026-09-14.
--
--   news_quality_enqueue_candidates(200000, 3) returned ZERO rows corpus-wide,
--   while /admin/inbox showed 782 news-quality items. The cron
--   `news_verdict_geo_backfill` (*/10) posts action=enqueue then action=run on
--   every firing, succeeds every time, and had nothing to enqueue. A drain with
--   an empty work list and a non-empty queue is indistinguishable from a healthy
--   one -- the same shape as `would_merge: 0` on the dedup engines.
--
-- THE LOCKED-OUT COHORT.
--
--   346 of those 782 carry NO VERDICT AT ALL: auto_publish_blocked_reasons IS
--   NULL (not an empty array), quality_decision NULL, relevance_score NULL,
--   quality_score_before NULL, sentiment NULL. Nothing ever judged them, yet
--   they sit in a HUMAN review queue as though a machine had decided a human was
--   needed. Absence of evidence, filed as evidence -- and they are invisible
--   meanwhile: 0 of 782 are in `search_documents` and all 782 are
--   seo_indexable=false, so neither a reader nor a crawler can reach them.
--
--   The other 436 are a real queue and are NOT touched here: each has a
--   quality_decision, a relevance_score, a pipeline version and a stated
--   blocked reason. Those are for a human.
--
-- WHY THEY WERE UNREACHABLE, AND WHY THE CEILING WAS RIGHT TO EXIST.
--
--   The selector excludes an article with >= p_max_failures (default 3) failed
--   jobs, counted OVER ALL TIME. That ceiling was added for a good reason and
--   its comment still states it: 29,181 failed jobs across 1,159 articles, all
--   'no_decision', ~$41/month re-asking questions that had already returned no
--   answer. Asking an undecidable article a 26th time does not make it
--   decidable. None of that is being reversed.
--
--   What the ceiling cannot express is that an attempt which produced no verdict
--   is not evidence ABOUT THE ARTICLE when the provider was the thing that was
--   broken. The failures are dated and they are not spread out:
--
--     'no_decision' for this cohort   2026-07: 1,585   2026-08: 17,461   2026-09: 57
--     corpus-wide                     2026-06:   727   2026-07:  3,766
--                                     2026-08: 21,857   2026-09:    86
--
--   August 2026 is the NVIDIA provider-chain window this repo already documents:
--   every reachable model is a reasoning model and narrates instead of answering
--   unless `chat_template_kwargs:{thinking:false}` is sent; the default tier
--   404'd because presence in /v1/models does not mean callable; a completion
--   pinned at max_tokens returned prose and was recorded as a SUCCESS. A
--   response the parser cannot read arrives here as 'no_decision' -- which is
--   byte-identical to "the model considered this article and could not decide".
--   Only 8 failed jobs exist corpus-wide at or after 2026-09-04.
--
--   279 of the 346 hold exactly 3 failures. The long tail predates the ceiling
--   and holds 151 to 805 each.
--
-- DECIDABILITY WAS MEASURED, NOT ASSUMED.
--
--   20 of the cohort were re-run through news-quality-backfill with dry_run --
--   the run path returns before any article write, and all 20 articles were
--   verified untouched afterwards, so this cost nothing but LLM calls. Every one
--   that completed came back with a well-formed verdict and NOT ONE returned
--   'no_decision': 18/18 decided at confidence 0.65-0.93, 16 judged publishable
--   and 2 correctly routed to manual review (one a clinical domestic-abuse
--   piece). Articles that had answered 'no_decision' three or more times in
--   August -- some of them hundreds of times -- answer cleanly today. They were
--   never undecidable. They were asked while the provider was broken.
--
-- THE FIX IS A WATERMARK, AND THE ALTERNATIVES WERE REJECTED FOR STATED REASONS.
--
--   Raising p_max_failures forgives nothing structurally -- it just moves the
--   number, and re-asks the genuinely undecidable as eagerly as the merely
--   unlucky, forever.
--
--   A ROLLING WINDOW ("failures in the last 30 days") is the marketplace
--   rejection treadmill one table over: an undecidable article becomes eligible
--   again every window, forever, and the spend never ends.
--
--   An EPOCH moves only when a human moves it. It says exactly what is true --
--   "we changed something, so attempts before this instant are no longer
--   evidence" -- and says it once. After the cohort drains, the ceiling is back
--   in force against the new epoch and nothing re-asks anything.
--
-- BLAST RADIUS IS THE COHORT AND ESSENTIALLY NOTHING ELSE, measured before
-- choosing the date: an epoch of 2026-09-04 makes 338 articles eligible -- 337
-- of the 346 plus one already-passed row -- against 0 eligible today. The other
-- 9 of the 346 carry a quality_pipeline_version and are excluded by the
-- selector's other arm; they are left alone rather than swept in, because
-- re-judging an article that already has a version is a different decision.
-- At batch 24 every 10 minutes the unlocked cohort is worked through in about
-- two and a half hours.
--
-- The epoch is NULL-safe: a NULL attempt_epoch counts every failure, which is
-- exactly today's behaviour, so the column being absent or unset can never
-- silently widen the gate.
-- ============================================================================

ALTER TABLE public.news_quality_settings
  ADD COLUMN IF NOT EXISTS attempt_epoch timestamptz;

COMMENT ON COLUMN public.news_quality_settings.attempt_epoch IS
  'Failed quality_backfill_jobs created BEFORE this instant do not count toward '
  'news_quality_enqueue_candidates'' per-article attempt ceiling. Move it only '
  'when the CAUSE of a wave of failures has been fixed, and record why -- it '
  'forgives past attempts once, deliberately, instead of forgiving them on a '
  'rolling schedule (which is a treadmill). NULL counts every failure.';

CREATE OR REPLACE FUNCTION public.news_quality_enqueue_candidates(
  p_limit integer DEFAULT 200,
  p_max_failures integer DEFAULT 3
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.id
  FROM public.news_articles a
  WHERE a.quality_pipeline_version IS NULL
    -- already in flight: do not stack a second job on the same article
    AND NOT EXISTS (
      SELECT 1 FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id AND j.status IN ('pending', 'running')
    )
    -- Asked enough times already SINCE THE CURRENT EPOCH. Attempts from before
    -- it are not evidence about the article -- see this migration's header.
    -- coalesce to -infinity keeps the pre-epoch behaviour when unset.
    AND (
      SELECT count(*) FROM public.quality_backfill_jobs j
      WHERE j.article_id = a.id
        AND j.status = 'failed'
        AND j.created_at >= coalesce(
              (SELECT s.attempt_epoch FROM public.news_quality_settings s WHERE s.id = 1),
              '-infinity'::timestamptz)
    ) < greatest(coalesce(p_max_failures, 3), 1)
  -- Newest first: heal the most-visible recent articles before the long tail.
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT greatest(least(coalesce(p_limit, 200), 20000), 1);
$function$;

-- Set the epoch to the boundary of the provider-fix window. 2026-09-04 is after
-- the last attempt in the stuck cohort and after the provider fixes landed; only
-- 8 failed jobs corpus-wide sit at or after it.
UPDATE public.news_quality_settings
   SET attempt_epoch = timestamptz '2026-09-04 00:00:00+00',
       updated_at = now(),
       notes = coalesce(nullif(notes, '') || E'\n', '')
               || '2026-09-14: attempt_epoch set to 2026-09-04 — the August NVIDIA '
               || 'provider window produced ~21.9k no_decision failures that locked '
               || '338 never-judged articles out of the drain entirely '
               || '(enqueue candidates were 0 corpus-wide). Decidability re-measured '
               || 'by dry run before unlocking.'
 WHERE id = 1;

-- ----------------------------------------------------------------------------
-- The second lock, and it is a different defect: NINE rows corpus-wide carry a
-- quality_pipeline_version with NO verdict behind it -- decision, relevance,
-- blocked reasons and sentiment all NULL, quality_status 'review'. A version
-- stamp asserts that a pipeline ran; these assert a run that produced nothing.
-- They are excluded by the selector's OTHER arm (quality_pipeline_version IS
-- NULL), so the epoch alone would leave them locked out forever, and they are
-- ordinary publishable news: WorldPride Amsterdam, Drag Race casting, a hate
-- crime piece, intersex science.
--
-- Clearing the stamp is not "re-judging a decided article" -- there is no
-- decision to preserve. The predicate is the incoherence itself, not a list of
-- ids, so it cannot sweep in a row that has a verdict, and it is asserted to
-- leave the corpus with none of this shape.
UPDATE public.news_articles
   SET quality_pipeline_version = NULL
 WHERE quality_status = 'review'
   AND quality_decision IS NULL
   AND quality_pipeline_version IS NOT NULL;

DO $verify$
DECLARE
  v_epoch     timestamptz;
  v_eligible  int;
  v_unjudged  int;
BEGIN
  SELECT attempt_epoch INTO v_epoch FROM public.news_quality_settings WHERE id = 1;
  IF v_epoch IS NULL THEN
    RAISE EXCEPTION 'attempt_epoch was not set on news_quality_settings id=1';
  END IF;

  SELECT count(*) INTO v_eligible FROM public.news_quality_enqueue_candidates(200000, 3);

  SELECT count(*) INTO v_unjudged
  FROM public.news_articles
  WHERE quality_status = 'review' AND quality_decision IS NULL;

  -- The POSTCONDITION is that the drain can now reach the backlog. It is
  -- deliberately count-free beyond "more than none": inflow and the */10 cron
  -- both move these numbers between authoring and apply, and a guard that goes
  -- red on ordinary churn is one people learn to ignore.
  IF v_unjudged > 0 AND v_eligible = 0 THEN
    RAISE EXCEPTION
      'news quality drain is still unreachable: % unjudged rows sit in review and 0 are eligible',
      v_unjudged;
  END IF;

  -- A version stamp with no verdict behind it must not exist anywhere.
  IF EXISTS (SELECT 1 FROM public.news_articles
              WHERE quality_pipeline_version IS NOT NULL AND quality_decision IS NULL) THEN
    RAISE EXCEPTION 'news_articles still carry a quality_pipeline_version with no quality_decision';
  END IF;

  RAISE NOTICE 'news quality epoch %: % eligible, % unjudged in review',
    v_epoch, v_eligible, v_unjudged;
END $verify$;
