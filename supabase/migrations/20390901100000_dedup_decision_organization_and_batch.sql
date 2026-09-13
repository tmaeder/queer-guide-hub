-- ============================================================================
-- Close the last silent CHECK gap in dedup persistence, and raise the news
-- drain batch to the measured ceiling
-- ============================================================================
--
-- PART 1 — 'organization' can never be journalled
--
-- #3588 fixed 'news', which was passed to record_dedup_decision as an internal
-- DEDUP_REGISTRY branch key and rejected 23514 by
-- scraper_dedupe_decisions_entity_type_check on every single row, silently,
-- for the life of the table. The same audit found TWO other registry values
-- absent from that CHECK:
--
--   hotel         NOT a live path — resolveDedupEntityType() returns 'unknown'
--                 for it (content-registry.ts), so it never reaches
--                 persistVerdict. Deliberately left alone.
--   organization  A live code path (buildDetArgs has an 'organization' case
--                 calling find_organization_duplicate_candidates) with NO
--                 canonical spelling in the CHECK to map onto — unlike news,
--                 which had 'news_article' waiting for it.
--
-- It is latent ONLY because prod holds zero organizations staging rows
-- (measured 2026-09-10: 0 rows, ever). The moment an org source is added it
-- fails exactly as news did — every decision rejected, dedup_status never
-- written, rows re-offered forever, and the run reporting success. This closes
-- it before that happens rather than after.
--
-- Both singular and plural are added, matching how every other entity in this
-- CHECK is spelled (venue/venues, city/cities, personality/personalities): the
-- registry emits the singular, and target_table-derived callers emit the plural.
--
-- PART 2 — news drain batch 100 → 300
--
-- Measured on prod today, not guessed: a 300-row pipeline-deduplicate call over
-- real news staging rows returned items_failed:0 / items_succeeded:300 in under
-- 2.5 minutes, against a 546s edge wall. ingestion_staging carries only four
-- light ROW triggers (idempotency, human-approval promotion, review audit,
-- updated_at) and NO search_documents sync, so the batch-cap discipline that
-- governs entity-table writes does not apply here.
--
-- At 100/hr the 3,070 rows awaiting validate needed ~30h to clear while inflow
-- continues; 300/hr clears it in ~10h and still outpaces the ~35 rows/hr the
-- source actually stages. Both stages move together: raising validate alone
-- just relocates the queue to dedup.
-- ============================================================================

-- ---- Part 1 -----------------------------------------------------------------

ALTER TABLE public.scraper_dedupe_decisions
  DROP CONSTRAINT IF EXISTS scraper_dedupe_decisions_entity_type_check;

ALTER TABLE public.scraper_dedupe_decisions
  ADD CONSTRAINT scraper_dedupe_decisions_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'venue'::text, 'venues'::text,
    'event'::text, 'events'::text,
    'place'::text, 'stay'::text,
    'city'::text, 'cities'::text,
    'country'::text, 'countries'::text,
    'personality'::text, 'personalities'::text,
    'news_article'::text, 'news_articles'::text,
    'marketplace'::text, 'marketplace_listing'::text,
    'organization'::text, 'organizations'::text
  ]));

COMMENT ON CONSTRAINT scraper_dedupe_decisions_entity_type_check
  ON public.scraper_dedupe_decisions IS
  'Canonical persistence spellings for dedup decisions. DEDUP_REGISTRY keys are '
  'INTERNAL branch selectors and are not automatically legal here — '
  'pipeline-deduplicate translates them via DECISION_ENTITY_TYPE before calling '
  'record_dedup_decision. Adding a registry entity type means adding it here too, '
  'or every insert fails 23514 and is swallowed into counters.onHardFail().';

-- ---- Part 2 -----------------------------------------------------------------

UPDATE public.admin_automations
   SET action = jsonb_set(action, '{command}',
         to_jsonb(replace(action->>'command',
                          '"batch_size":100', '"batch_size":300')))
 WHERE slug IN ('news_drain_validate', 'news_drain_dedup')
   AND action->>'command' LIKE '%"batch_size":100%';

SELECT public.sync_automations_to_cron(true);

-- ---- Postconditions ---------------------------------------------------------

DO $verify$
DECLARE
  v_bad int;
  v_def text;
BEGIN
  -- Assert the CONSTRAINT DEFINITION rather than probing with an INSERT: the
  -- table has four more NOT NULL columns (entity_a_id, match_method,
  -- confidence, decided_by), so a probe row needs fabricated values and leaves
  -- an audit artefact in a decisions ledger if the cleanup is ever wrong.
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.scraper_dedupe_decisions'::regclass
     AND conname  = 'scraper_dedupe_decisions_entity_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'entity_type CHECK is missing entirely after the rewrite';
  END IF;

  -- organization must now be legal — the live path that had no canonical
  -- spelling to map onto.
  IF v_def !~ '''organization''::text' THEN
    RAISE EXCEPTION 'organization is still absent from the entity_type CHECK: %', v_def;
  END IF;

  -- The bare internal key must remain ILLEGAL, or the DECISION_ENTITY_TYPE
  -- translation in pipeline-deduplicate stops being load-bearing and could be
  -- deleted with nothing failing. Anchored on the exact quoted literal, because
  -- a naive LIKE '%news%' matches 'news_article' and would always pass.
  IF v_def ~ '''news''::text' THEN
    RAISE EXCEPTION 'the bare internal key ''news'' became legal — the news→news_article translation is no longer load-bearing: %', v_def;
  END IF;

  -- And the spelling news IS translated to must be present, or #3588's fix
  -- silently stops working.
  IF v_def !~ '''news_article''::text' THEN
    RAISE EXCEPTION 'news_article is missing from the entity_type CHECK: %', v_def;
  END IF;

  -- Both news drains must carry the raised batch, in the registry AND in
  -- pg_cron. A migration that "fixes" a cron by rewriting only the registry is
  -- the drift class that left detect_stale_venues on its old threshold.
  SELECT count(*) INTO v_bad
    FROM public.admin_automations
   WHERE slug IN ('news_drain_validate','news_drain_dedup')
     AND action->>'command' NOT LIKE '%"batch_size":300%';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'news drain registry did not take the raised batch (% row(s))', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM cron.job
   WHERE jobname IN ('news-drain-validate','news-drain-dedup')
     AND command NOT LIKE '%"batch_size":300%';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'news drain cron did not take the raised batch (% job(s))', v_bad;
  END IF;
END $verify$;
