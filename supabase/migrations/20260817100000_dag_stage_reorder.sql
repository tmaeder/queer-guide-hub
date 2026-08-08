-- ============================================================================
-- Taxonomy-aligned stage order: cheap deterministic gates BEFORE paid stages —
-- overhaul Phase 3b (requires the P3a function deploys: enrichment-driver
-- requireGates + marketplace-relevance dedup filter + quality-enhance guard,
-- all tolerant of BOTH orders).
-- ----------------------------------------------------------------------------
-- Canonical order: source → normalize → extract/sanitize → VALIDATE → DEDUP →
-- [LLM: relevance/enrich] → quality-score → review-gate → commit.
-- Measured waste being removed (live, 2026-08-07):
--   news: 852 rows/14d enriched-then-validate-rejected (~120 LLM calls/day)
--   marketplace: relevance classified 641 merge_candidates/14d pre-verdict
--   events: enrich ran before validate on an intake that commits 13/11,275
-- Feasibility verified: pipeline-validate reads only normalized_data;
-- pipeline-deduplicate reads normalized_data + gates on
-- ai_validation_status='approved' (no enriched_data dependency; its semantic
-- arm embeds staging text on the fly).
--
-- Mechanics: element-wise edge rewiring (CASE on source→target pairs),
-- preserving every other key on the edge objects (React Flow ids/handles) and
-- appending a suffix to rewired edge ids to keep them unique. Guarded on the
-- exact live version read 2026-08-07 (news v9, marketplace v8, events v7,
-- venue v9) — if an admin edited a DAG since, that family is SKIPPED (rerun
-- with refreshed pairs rather than clobbering an unseen shape; the
-- search_hybrid clobber taught us never to overwrite live definitions blind).
--
-- ROLLBACK per family: swap each pair back (the inverse map is this file's
-- CASE read right-to-left) and decrement version.
-- ============================================================================

-- ---- news-ingestion v9 → v10 -----------------------------------------------
-- (sanitize→enrich) ⇒ (sanitize→validate); (quality_enhance→validate) ⇒
-- (quality_enhance→quality); (dedup→quality) ⇒ (dedup→enrich).
-- Result: sanitize → validate → dedup → enrich → quality_enhance → quality.
UPDATE public.pipeline_definitions p
SET version = 10,
    updated_at = now(),
    edges = (
      SELECT jsonb_agg(
        CASE
          WHEN e->>'source'='sanitize' AND e->>'target'='enrich'
            THEN e || jsonb_build_object('target','validate','id', coalesce(e->>'id','e')||'-v10')
          WHEN e->>'source'='quality_enhance' AND e->>'target'='validate'
            THEN e || jsonb_build_object('target','quality','id', coalesce(e->>'id','e')||'-v10')
          WHEN e->>'source'='dedup' AND e->>'target'='quality'
            THEN e || jsonb_build_object('target','enrich','id', coalesce(e->>'id','e')||'-v10')
          ELSE e
        END ORDER BY ord)
      FROM jsonb_array_elements(p.edges) WITH ORDINALITY t(e, ord)
    ),
    nodes = (
      -- enrich + quality_enhance only touch rows that passed the new gates
      SELECT jsonb_agg(
        CASE WHEN n->>'id' IN ('enrich','quality_enhance')
          THEN jsonb_set(n, '{data,config,requireGates}', 'true'::jsonb, true)
          ELSE n
        END ORDER BY ord)
      FROM jsonb_array_elements(p.nodes) WITH ORDINALITY t(n, ord)
    )
WHERE p.name = 'news-ingestion' AND p.version = 9;

-- ---- marketplace-ingestion v8 → v9 -----------------------------------------
-- (validate→relevance) ⇒ (validate→dedup); (relevance→dedup) ⇒
-- (dedup→relevance); (dedup→quality) ⇒ (relevance→quality).
UPDATE public.pipeline_definitions p
SET version = 9,
    updated_at = now(),
    edges = (
      SELECT jsonb_agg(
        CASE
          WHEN e->>'source'='validate' AND e->>'target'='relevance'
            THEN e || jsonb_build_object('target','dedup','id', coalesce(e->>'id','e')||'-v9')
          WHEN e->>'source'='relevance' AND e->>'target'='dedup'
            THEN e || jsonb_build_object('source','dedup','target','relevance','id', coalesce(e->>'id','e')||'-v9')
          WHEN e->>'source'='dedup' AND e->>'target'='quality'
            THEN e || jsonb_build_object('source','relevance','id', coalesce(e->>'id','e')||'-v9')
          ELSE e
        END ORDER BY ord)
      FROM jsonb_array_elements(p.edges) WITH ORDINALITY t(e, ord)
    )
WHERE p.name = 'marketplace-ingestion' AND p.version = 8;

-- ---- events-ingestion-bulletproof v7 → v8 ----------------------------------
-- (geocode→enrich) ⇒ (geocode→validate); (enrich→validate) ⇒ (enrich→quality);
-- (deduplicate→quality) ⇒ (deduplicate→enrich).
-- Result: geocode → validate → deduplicate → enrich → quality.
UPDATE public.pipeline_definitions p
SET version = 8,
    updated_at = now(),
    edges = (
      SELECT jsonb_agg(
        CASE
          WHEN e->>'source'='geocode' AND e->>'target'='enrich'
            THEN e || jsonb_build_object('target','validate','id', coalesce(e->>'id','e')||'-v8')
          WHEN e->>'source'='enrich' AND e->>'target'='validate'
            THEN e || jsonb_build_object('target','quality','id', coalesce(e->>'id','e')||'-v8')
          WHEN e->>'source'='deduplicate' AND e->>'target'='quality'
            THEN e || jsonb_build_object('target','enrich','id', coalesce(e->>'id','e')||'-v8')
          ELSE e
        END ORDER BY ord)
      FROM jsonb_array_elements(p.edges) WITH ORDINALITY t(e, ord)
    ),
    nodes = (
      SELECT jsonb_agg(
        CASE WHEN n->>'id' = 'enrich'
          THEN jsonb_set(n, '{data,config,requireGates}', 'true'::jsonb, true)
          ELSE n
        END ORDER BY ord)
      FROM jsonb_array_elements(p.nodes) WITH ORDINALITY t(n, ord)
    )
WHERE p.name = 'events-ingestion-bulletproof' AND p.version = 7;

-- ---- venue-ingestion-unified v9 → v10 --------------------------------------
-- (validate→enrich) ⇒ (validate→dedupe); (enrich→dedupe) ⇒ (dedupe→enrich);
-- (dedupe→quality) ⇒ (enrich→quality).
UPDATE public.pipeline_definitions p
SET version = 10,
    updated_at = now(),
    edges = (
      SELECT jsonb_agg(
        CASE
          WHEN e->>'source'='validate' AND e->>'target'='enrich'
            THEN e || jsonb_build_object('target','dedupe','id', coalesce(e->>'id','e')||'-v10')
          WHEN e->>'source'='enrich' AND e->>'target'='dedupe'
            THEN e || jsonb_build_object('source','dedupe','target','enrich','id', coalesce(e->>'id','e')||'-v10')
          WHEN e->>'source'='dedupe' AND e->>'target'='quality'
            THEN e || jsonb_build_object('source','enrich','id', coalesce(e->>'id','e')||'-v10')
          ELSE e
        END ORDER BY ord)
      FROM jsonb_array_elements(p.edges) WITH ORDINALITY t(e, ord)
    ),
    nodes = (
      SELECT jsonb_agg(
        CASE WHEN n->>'id' = 'enrich'
          THEN jsonb_set(n, '{data,config,requireGates}', 'true'::jsonb, true)
          ELSE n
        END ORDER BY ord)
      FROM jsonb_array_elements(p.nodes) WITH ORDINALITY t(n, ord)
    )
WHERE p.name = 'venue-ingestion-unified' AND p.version = 9;

-- ---- marketplace drain restagger -------------------------------------------
-- Dedup must run before relevance in the hourly drain ladder too:
-- mp-drain-dedup :25 → :12; mp-drain-relevance-fresh drops its pre-dedup :10
-- slot (10,25,40,55 → 25,40,55). Commands are preserved verbatim; registry
-- schedules updated in lockstep (a stale registry copy re-arms old params —
-- the cron-registry contract).
DO $$
DECLARE v_cmd text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'mp-drain-dedup';
  IF v_cmd IS NOT NULL THEN
    PERFORM cron.unschedule('mp-drain-dedup');
    PERFORM cron.schedule('mp-drain-dedup', '12 * * * *', v_cmd);
    UPDATE public.admin_automations SET schedule = '12 * * * *'
     WHERE slug = 'mp_drain_dedup';
  END IF;

  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'mp-drain-relevance-fresh';
  IF v_cmd IS NOT NULL THEN
    PERFORM cron.unschedule('mp-drain-relevance-fresh');
    PERFORM cron.schedule('mp-drain-relevance-fresh', '25,40,55 * * * *', v_cmd);
    UPDATE public.admin_automations SET schedule = '25,40,55 * * * *'
     WHERE slug = 'mp_drain_relevance_fresh';
  END IF;
END $$;
