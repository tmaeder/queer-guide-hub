-- Country Content Completeness Engine — foundation
-- Adds a per-country data-completeness meter (distinct from equality_score, which
-- is legal status) and the machinery to fill gaps systematically:
--   * countries.content_completeness_score (0-100) + enrichment_status jsonb
--     (per-field terminal-state map; `data_unavailable` = no source has it →
--      credited as resolved so we stop retrying)
--   * run_country_completeness_recompute()  — pure-SQL nightly scorer
--   * countries_due_for_enrichment(limit, phase) — selector RPC
--   * paused admin_automations row + dispatch-RPC wiring
--   * cron: SQL recompute (no-op while paused) + weekly Wolfram + editorial enqueues
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).

-- ===== 1. columns =====
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS content_completeness_score smallint,
  ADD COLUMN IF NOT EXISTS enrichment_status jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.countries.content_completeness_score IS
  'Data completeness 0-100 (editorial+facts+stats+legal coverage+media). Distinct from equality_score (=legal status). Recomputed by run_country_completeness_recompute().';
COMMENT ON COLUMN public.countries.enrichment_status IS
  'Per-field enrichment state map {field:{state,source,attempts,at}}. state=data_unavailable is terminal: scorer credits it, selector skips it.';

CREATE INDEX IF NOT EXISTS idx_countries_completeness
  ON public.countries(content_completeness_score NULLS FIRST) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_countries_editorial_null
  ON public.countries(id) WHERE editorial_hook IS NULL AND duplicate_of_id IS NULL;

-- ===== 2. completeness recompute (pure SQL, nightly) =====
-- Uniform bar over all live countries. A field counts present if it has a value
-- OR enrichment_status marks it data_unavailable. Weights (sum 100) are literals
-- below — retune here. Buckets: editorial 25 | core facts 25 | stats 20 |
-- legal coverage 20 | media+geo 10.
CREATE OR REPLACE FUNCTION public.run_country_completeness_recompute()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'country_completeness_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'country_completeness_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scored AS (
    SELECT id, (
        -- editorial (25)
        CASE WHEN description IS NOT NULL AND length(trim(description)) > 0 THEN 10 ELSE 0 END
      + CASE WHEN editorial_hook IS NOT NULL THEN 8 ELSE 0 END
      + CASE WHEN editorial_long IS NOT NULL THEN 7 ELSE 0 END
        -- core facts (25)
      + CASE WHEN capital IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN currency IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN array_length(languages, 1) > 0 THEN 4 ELSE 0 END
      + CASE WHEN population IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN area_km2 IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN flag_emoji IS NOT NULL THEN 4 ELSE 0 END
        -- stats (20) — value present OR terminal data_unavailable
      + CASE WHEN gdp_usd IS NOT NULL                 OR enrichment_status->'gdp_usd'->>'state'                = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN gdp_per_capita_usd IS NOT NULL      OR enrichment_status->'gdp_per_capita_usd'->>'state'     = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN human_development_index IS NOT NULL OR enrichment_status->'human_development_index'->>'state' = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN life_expectancy IS NOT NULL         OR enrichment_status->'life_expectancy'->>'state'         = 'data_unavailable' THEN 4 ELSE 0 END
      + CASE WHEN literacy_rate IS NOT NULL           OR enrichment_status->'literacy_rate'->>'state'           = 'data_unavailable' THEN 4 ELSE 0 END
        -- legal coverage (20) — value present OR terminal data_unavailable
        -- (uninhabited territories have no legal regime to record)
      + CASE WHEN equality_score IS NOT NULL OR enrichment_status->'equality_score'->>'state' = 'data_unavailable' THEN 10 ELSE 0 END
      + CASE WHEN (lgbti_criminalization IS NOT NULL AND lgbti_criminalization <> '{}'::jsonb) OR enrichment_status->'lgbti_criminalization'->>'state' = 'data_unavailable' THEN 10 ELSE 0 END
        -- media + geo (10)
      + CASE WHEN image_url IS NOT NULL OR curated_image_url IS NOT NULL THEN 5 ELSE 0 END
      + CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 5 ELSE 0 END
      )::smallint AS new_score
    FROM public.countries WHERE duplicate_of_id IS NULL
  )
  UPDATE public.countries c
    SET content_completeness_score = s.new_score
  FROM scored s
  WHERE c.id = s.id AND c.content_completeness_score IS DISTINCT FROM s.new_score;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.countries WHERE duplicate_of_id IS NULL;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
        summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_country_completeness_recompute() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_country_completeness_recompute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_country_completeness_recompute() TO service_role, authenticated;

-- ===== 3. selector RPC =====
-- Ranks countries for the enrichment loop: never-scored first, then lowest
-- completeness, then stalest. p_phase narrows the set: 'editorial' (no hook),
-- 'stats' (a fillable stat field), or 'all'.
CREATE OR REPLACE FUNCTION public.countries_due_for_enrichment(
  p_limit int DEFAULT 20,
  p_phase text DEFAULT 'all'
)
RETURNS TABLE (id uuid, name text, content_completeness_score smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.content_completeness_score
  FROM public.countries c
  WHERE c.duplicate_of_id IS NULL
    AND (
      p_phase = 'all'
      OR (p_phase = 'editorial'
          AND c.editorial_hook IS NULL
          AND COALESCE(c.enrichment_status->'editorial'->>'state','') NOT IN ('published','review'))
      OR (p_phase = 'stats' AND (
            (c.gdp_usd IS NULL                 AND COALESCE(c.enrichment_status->'gdp_usd'->>'state','')                <> 'data_unavailable')
         OR (c.gdp_per_capita_usd IS NULL      AND COALESCE(c.enrichment_status->'gdp_per_capita_usd'->>'state','')     <> 'data_unavailable')
         OR (c.human_development_index IS NULL AND COALESCE(c.enrichment_status->'human_development_index'->>'state','') <> 'data_unavailable')
         OR (c.life_expectancy IS NULL         AND COALESCE(c.enrichment_status->'life_expectancy'->>'state','')         <> 'data_unavailable')
         OR (c.literacy_rate IS NULL           AND COALESCE(c.enrichment_status->'literacy_rate'->>'state','')           <> 'data_unavailable')
      ))
    )
  ORDER BY (c.content_completeness_score IS NULL) DESC,
           c.content_completeness_score ASC NULLS FIRST,
           c.last_refreshed_at ASC NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 250));
$$;
ALTER FUNCTION public.countries_due_for_enrichment(int, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.countries_due_for_enrichment(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.countries_due_for_enrichment(int, text) TO service_role, authenticated;

-- ===== 4. register automation (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('country_completeness_recompute','Recompute country completeness scores',
   'Nightly pure-SQL data-completeness score (0-100) per country across editorial, core facts, stats, legal coverage, and media. Distinct from equality_score (legal).',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_country_completeness_recompute"}'::jsonb, '30 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 5. extend dispatch RPCs (preserve all existing branches) =====
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
  ELSIF p_slug = 'venue_coord_snap' THEN v_result := public.run_venue_coord_snap();
  ELSIF p_slug = 'country_completeness_recompute' THEN v_result := public.run_country_completeness_recompute();
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_automation_dry_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_automation_id uuid; v_examined int := 0; v_started_at timestamptz := now();
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_automation_id FROM public.admin_automations WHERE slug = p_slug;
  IF v_automation_id IS NULL THEN
    RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  IF p_slug = 'event_auto_archive' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE status='active' AND end_date IS NOT NULL AND end_date < now() - interval '7 days';
  ELSIF p_slug = 'staging_auto_reject_stale' THEN
    SELECT count(*) INTO v_examined FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending' AND created_at < now() - interval '60 days';
  ELSIF p_slug = 'workflow_runs_purge' THEN
    SELECT count(*) INTO v_examined FROM public.workflow_runs
    WHERE status='completed' AND started_at < now() - interval '30 days';
  ELSIF p_slug = 'enrichment_log_purge' THEN
    SELECT count(*) INTO v_examined FROM public.enrichment_log
    WHERE status IN ('skipped','done') AND created_at < now() - interval '30 days';
  ELSIF p_slug = 'event_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (start_date > now() - interval '7 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  ELSIF p_slug = 'event_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE is_major_city = true;
  ELSIF p_slug = 'venue_coord_snap' THEN
    SELECT count(*) INTO v_examined FROM public.venues_misplaced(NULL) WHERE is_geocodable = false;
  ELSIF p_slug = 'country_completeness_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.countries WHERE duplicate_of_id IS NULL;
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 6. register editorial workflow (single-function) =====
INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name,
   default_payload, max_retries, retry_backoff_base, max_concurrency,
   timeout_seconds, is_enabled, priority, tags)
VALUES
  ('enrich-country-editorial', 'Enrich Countries (Editorial)',
   'Generate grounded editorial hook + paragraph for countries; hybrid-by-confidence auto-publish vs review queue.',
   'pipeline-enrich-country-editorial', 'import_jobs',
   '{"batch_size": 8}'::jsonb,
   2, 60, 1, 300, true, 5, ARRAY['enrichment','editorial','country'])
ON CONFLICT (name) DO UPDATE
  SET description=EXCLUDED.description, edge_function=EXCLUDED.edge_function, default_payload=EXCLUDED.default_payload;

-- ===== 7. cron =====
-- SQL recompute (no-op while paused) + weekly Wolfram stats + weekly editorial,
-- both enqueued via pgmq → workflow-dispatcher (same pattern as wf-country-ingestion).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='country_completeness_recompute') THEN PERFORM cron.unschedule('country_completeness_recompute'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-enrich-wolfram-countries') THEN PERFORM cron.unschedule('wf-enrich-wolfram-countries'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='wf-enrich-country-editorial') THEN PERFORM cron.unschedule('wf-enrich-country-editorial'); END IF;
END $$;

SELECT cron.schedule('country_completeness_recompute', '30 3 * * *', 'SELECT public.run_country_completeness_recompute();');

SELECT cron.schedule(
  'wf-enrich-wolfram-countries', '0 5 * * 0',
  $cron$
    SELECT pgmq.send('scheduled_jobs', jsonb_build_object(
      'workflow','enrich-wolfram-countries','triggered_by','cron','scheduled_at',now()));
  $cron$
);

SELECT cron.schedule(
  'wf-enrich-country-editorial', '0 6 * * 0',
  $cron$
    SELECT pgmq.send('scheduled_jobs', jsonb_build_object(
      'workflow','enrich-country-editorial','triggered_by','cron','scheduled_at',now()));
  $cron$
);
