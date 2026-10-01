-- A news article that PASSES quality after being in review can never become
-- indexable again, because the flag is only ever driven one way.
--
-- THE MECHANISM. `trg_news_enforce_seo_indexable` (20260714192445) forces
-- `seo_indexable = false` whenever `quality_status` is 'rejected' or 'review',
-- from any write path. That half is right and is untouched here. Its own header
-- states the other half deliberately: "It NEVER forces indexable=true, so an
-- admin de-indexing a legitimately-passed article is respected."
--
-- The consequence nobody stated: an article that is judged 'review', gets
-- de-indexed by the trigger, and is later judged 'passed' stays de-indexed
-- forever. Nothing in the schema ever writes that column back to true.
--
-- MEASURED ON PROD, and the corpus is what makes the case rather than the
-- reasoning. Of 27,171 articles that are `quality_status='passed'` with an
-- EMPTY `auto_publish_blocked_reasons`, 26,913 are indexable and exactly 258
-- are not -- and all 258 additionally carry `quality_decision.shouldPublish =
-- true`, i.e. the gate's own affirmative verdict. 99.1% indexable is the norm
-- for that cohort, so the 258 are not a policy tier, they are the residue of a
-- one-way door. They are real pages: 250 of 258 carry a body over 200
-- characters, published 2018-07-17 through 2026-09-20, and a crawler fetch of
-- two of them returns HTTP 200 with their own titles (a nonsense slug 404s, so
-- the 200 means something) and `robots: noindex,nofollow`.
--
-- 78 of them were judged on 2026-09-20 by the fixed quality gate (#3872, the
-- control-character repair), which is how the cohort became visible at all:
-- before that fix the drain decided nothing, so nothing was arriving at this
-- door.
--
-- WHY THE RESTORE IS SAFE FOR THE PROPERTY THE ORIGINAL COMMENT PROTECTS, and
-- this is the whole argument. While a row is 'review' or 'rejected' the trigger
-- forces the column to false on EVERY write, so in that state the column
-- carries no human signal -- a human de-indexing a review row is a no-op the
-- trigger would have performed anyway. Restoring on the TRANSITION OUT of that
-- state therefore destroys no decision. For a row that is already 'passed'
-- there is no transition, so a human de-index there is still respected exactly
-- as before.
--
-- The residual cost is stated rather than hidden: if a human de-indexes a
-- PASSED article and that article is later re-judged through 'review' and back
-- to 'passed', their decision is forgotten. That is narrow but not theoretical
-- -- 12 human writes to `seo_indexable` exist in `content_revisions`, 9 of them
-- to false -- so the one-shot sweep below EXCLUDES any row with such a write on
-- record instead of trusting the measurement (0 in this cohort today).
--
-- THE AUDIT WINDOW IS 11 DAYS AND THAT IS NAMED, NOT GLOSSED. Content
-- versioning started 2026-09-14, so "no human de-index on record" is evidence
-- over that window only, not over all time. The transition argument above is
-- what carries the rest; the exclusion clause is the belt.
--
-- ONE ROW IS A `verdict_restore` ROW AND IT BELONGS IN THE SWEEP. 41000101100000
-- de-indexed 88 mis-verdicted PubMed/Nature articles and re-enqueued them for a
-- fresh judgement. One of those, "Inclusion of LGBT+ researchers is key"
-- (Nature, relevance 0.8, confidence 0.9), came back passed with no blockers --
-- the re-judge correctly rescuing the one genuinely LGBTQ+ article from that
-- batch. Re-indexing it is that machinery working, not a regression of it.
--
-- BATCH: 258 rows in one statement. `trg_search_documents_news` is UNSCOPED
-- (AFTER INSERT OR DELETE OR UPDATE, no column list), so this enqueues 258
-- reindexes into `search_reindex_queue` -- under the 300/batch convention this
-- repo uses for that chain, and one-shot.
--
-- Attribution needs no new bookkeeping: `trg_content_revision` is unscoped on
-- this table and `log_content_revision()` reads `app.actor`, so the sweep
-- records itself in `content_revisions` like any other write.

-- ---------------------------------------------------------------------------
-- 1. THE PRODUCER. The de-index branch is byte-identical; the restore branch is
--    an ELSIF beneath it, so the two are exclusive by construction. The
--    `search_path` pin is preserved from the live definition -- `CREATE OR
--    REPLACE` drops a SET clause as silently as it drops a branch.
--
--    `quality_decision->>'shouldPublish' = 'true'` is a TEXT comparison on
--    purpose: a `::boolean` cast on malformed jsonb would raise inside a BEFORE
--    trigger and break every write to the table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.news_enforce_seo_indexable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'auth', 'storage'
AS $function$
BEGIN
  IF NEW.quality_status IN ('rejected','review') AND NEW.seo_indexable IS DISTINCT FROM false THEN
    NEW.seo_indexable := false;

  -- Leaving review/rejected for a clean pass. In that prior state the column
  -- was forced false by the branch above on every write, so it held no human
  -- decision and restoring it discards none.
  ELSIF TG_OP = 'UPDATE'
    AND OLD.quality_status IN ('rejected','review')
    AND NEW.quality_status = 'passed'
    AND NEW.seo_indexable IS NOT TRUE
    AND coalesce(array_length(NEW.auto_publish_blocked_reasons, 1), 0) = 0
    AND NEW.quality_decision->>'shouldPublish' = 'true'
  THEN
    NEW.seo_indexable := true;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. THE BACKLOG. Same predicate as the restore branch, minus the transition
--    (which is unobservable for rows that crossed the door before this file),
--    plus the human-de-index exclusion.
--
--    THE HUMAN-DE-INDEX PROBE IS CORRELATED, AND THAT IS A 12x DIFFERENCE
--    RATHER THAN A STYLE CHOICE. `content_revisions` is 3,275,624 rows /
--    1,681 MB across 25 tables, so a standalone CTE collecting every human
--    `seo_indexable` write scans the whole table: measured 15,138 ms, which is
--    past the 8 s `statement_timeout` PostgREST's `authenticator` role pins and
--    would make the sentinel below time out on every CI run (the
--    `tag_hygiene_stats` 57014 class). Correlated on the ~267 candidate rows it
--    uses `content_revisions_entity_idx (source_table, source_id, seq DESC)`
--    and measures 1,201 ms for the identical answers.
-- ---------------------------------------------------------------------------
SELECT set_config('app.actor', 'migration:99991790880121_news_passed_articles_regain_indexable', true);

UPDATE public.news_articles a
   SET seo_indexable = true
 WHERE a.quality_status = 'passed'
   AND a.seo_indexable = false
   AND coalesce(array_length(a.auto_publish_blocked_reasons, 1), 0) = 0
   AND a.quality_decision->>'shouldPublish' = 'true'
   AND NOT EXISTS (
         SELECT 1 FROM public.content_revisions r
          WHERE r.source_table = 'news_articles'
            AND r.source_id = a.id
            AND 'seo_indexable' = ANY(r.changed_fields)
            AND r.actor_kind IS DISTINCT FROM 'system'
            AND r.after->>'seo_indexable' = 'false');

-- ---------------------------------------------------------------------------
-- 3. THE SENTINEL. Standalone rather than a key on an existing signals
--    function: `news_quality_signals()` is its own CREATE OR REPLACE body and
--    restating it to add a counter is a merge-collision surface.
--
--    `passed_unblocked_total` is reported FIRST because zero un-indexed rows
--    over an empty cohort is vacuous, not clean -- and `trigger_attached` is
--    reported separately from the count, because an absent seal and a repaired
--    corpus otherwise give the same reassuring zero.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.news_index_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
WITH cohort AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE a.seo_indexable) AS indexable
    FROM public.news_articles a
   WHERE a.quality_status = 'passed'
     AND coalesce(array_length(a.auto_publish_blocked_reasons, 1), 0) = 0
),
-- Only the DEINDEXED candidates reach the revisions probe, so the anti-join
-- runs a few hundred index lookups instead of a 1.7 GB scan. See the sweep
-- above: the uncorrelated form measures 15,138 ms against an 8 s ceiling.
candidates AS (
  SELECT (a.quality_decision->>'shouldPublish' = 'true') AS judge_publish,
         EXISTS (
           SELECT 1 FROM public.content_revisions r
            WHERE r.source_table = 'news_articles'
              AND r.source_id = a.id
              AND 'seo_indexable' = ANY(r.changed_fields)
              AND r.actor_kind IS DISTINCT FROM 'system'
              AND r.after->>'seo_indexable' = 'false') AS human_deindexed
    FROM public.news_articles a
   WHERE a.quality_status = 'passed'
     AND a.seo_indexable = false
     AND coalesce(array_length(a.auto_publish_blocked_reasons, 1), 0) = 0
)
SELECT jsonb_build_object(
  'probe_ok', true,
  'passed_unblocked_total', (SELECT total FROM cohort),
  'passed_unblocked_indexable', (SELECT indexable FROM cohort),
  'deindexed_despite_publish_verdict',
    (SELECT count(*) FROM candidates WHERE judge_publish AND NOT human_deindexed),
  'human_deindexed_excluded',
    (SELECT count(*) FROM candidates WHERE human_deindexed),
  'trigger_attached', EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.news_articles'::regclass
       AND t.tgname = 'trg_news_enforce_seo_indexable'
       AND NOT t.tgisinternal
       AND t.tgenabled <> 'D')
);
$fn$;

REVOKE ALL ON FUNCTION public.news_index_signals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.news_index_signals() FROM anon;
REVOKE ALL ON FUNCTION public.news_index_signals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.news_index_signals() TO service_role;

COMMENT ON FUNCTION public.news_index_signals() IS
  'Invariant: a news article the quality gate passed with no blockers and an affirmative shouldPublish verdict is indexable. Reports the cohort size and trigger attachment separately so a zero cannot be read as clean on an unmeasured corpus.';

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS. Hard on the state this file exists to reach, and on the two
-- mirrors that an over-reaching sweep would break.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_bad        bigint;
  v_rejected   bigint;
  v_blocked    bigint;
  v_indexable  bigint;
  v_src        text;
BEGIN
  -- P1: the reached state, counted POSITIVELY. A count of rows in the bad state
  -- returns zero for a cohort that has vanished entirely, which the soft
  -- exclusion clause above can legitimately produce.
  SELECT count(*) INTO v_bad
    FROM public.news_articles a
   WHERE a.quality_status = 'passed'
     AND a.seo_indexable = false
     AND coalesce(array_length(a.auto_publish_blocked_reasons, 1), 0) = 0
     AND a.quality_decision->>'shouldPublish' = 'true'
     AND NOT EXISTS (
           SELECT 1 FROM public.content_revisions r
            WHERE r.source_table = 'news_articles'
              AND r.source_id = a.id
              AND 'seo_indexable' = ANY(r.changed_fields)
              AND r.actor_kind IS DISTINCT FROM 'system'
              AND r.after->>'seo_indexable' = 'false');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'news seo_indexable restore incomplete: % passed/unblocked/shouldPublish articles are still deindexed', v_bad;
  END IF;

  SELECT count(*) INTO v_indexable
    FROM public.news_articles a
   WHERE a.quality_status = 'passed'
     AND a.seo_indexable = true
     AND coalesce(array_length(a.auto_publish_blocked_reasons, 1), 0) = 0;
  IF v_indexable < 20000 THEN
    RAISE EXCEPTION 'news seo_indexable probe is measuring nothing: only % passed/unblocked indexable rows', v_indexable;
  END IF;

  -- P2 MIRROR: the sweep must not have reached a rejected row. Every rejected
  -- article is deindexed and must stay so; this is the half of the check that
  -- an over-reaching UPDATE would break while P1 still passed.
  SELECT count(*) INTO v_rejected
    FROM public.news_articles
   WHERE quality_status = 'rejected' AND seo_indexable = true;
  IF v_rejected <> 0 THEN
    RAISE EXCEPTION 'news seo_indexable restore over-reached: % rejected articles became indexable', v_rejected;
  END IF;

  -- P3 MIRROR: a passed article WITH a stated blocker is a legitimate
  -- deindexed row (image_unusable, truncated_body, advertorial) and is not this
  -- file's business. Measured at 5,034 before the sweep; assert the class still
  -- exists rather than pinning the number, which ingest moves hourly.
  SELECT count(*) INTO v_blocked
    FROM public.news_articles
   WHERE quality_status = 'passed'
     AND seo_indexable = false
     AND coalesce(array_length(auto_publish_blocked_reasons, 1), 0) > 0;
  IF v_blocked < 1000 THEN
    RAISE EXCEPTION 'news seo_indexable restore over-reached: only % blocked passed articles remain deindexed', v_blocked;
  END IF;

  -- P4: the producer assigns true somewhere. Deliberately an ASSIGNMENT check
  -- and not a condition check -- 20810101100100 aborted db push repo-wide by
  -- asserting one PHRASING of a condition that a later rewrite preserved. The
  -- branch predicate is asserted in the repo test, where a false alarm costs
  -- one PR instead of the whole queue.
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'news_enforce_seo_indexable';
  IF v_src IS NULL OR v_src !~* 'seo_indexable\s*:=\s*true' THEN
    RAISE EXCEPTION 'news_enforce_seo_indexable never assigns seo_indexable := true -- the one-way door is back';
  END IF;
  IF v_src !~* 'search_path' THEN
    RAISE EXCEPTION 'news_enforce_seo_indexable lost its search_path pin';
  END IF;

  -- P5: the sentinel answers and agrees with P1.
  IF (public.news_index_signals()->>'probe_ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'news_index_signals did not report probe_ok';
  END IF;
  IF (public.news_index_signals()->>'deindexed_despite_publish_verdict')::bigint <> 0 THEN
    RAISE EXCEPTION 'news_index_signals disagrees with the repair it was written to watch';
  END IF;
  IF (public.news_index_signals()->>'trigger_attached')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'trg_news_enforce_seo_indexable is not attached or is disabled';
  END IF;

  RAISE NOTICE 'news seo_indexable: % passed/unblocked indexable, 0 deindexed against their own publish verdict, % blocked rows untouched', v_indexable, v_blocked;
END
$verify$;
