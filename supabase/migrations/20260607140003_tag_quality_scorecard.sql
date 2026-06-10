-- ============================================================================
-- Tag Content-Quality: Phase 0 — Quality scorecard foundation
-- ----------------------------------------------------------------------------
-- Adds a composite quality_score (0-100) + per-dimension breakdown to
-- unified_tags, a pure-SQL nightly recompute (mirrors run_event_trust_recompute),
-- an admin_automations registration (PAUSED), dispatch wiring, and a read-only
-- scorecard RPC for the admin panel.
--
-- The recompute updates ONLY rows whose score changed (IS DISTINCT FROM) so
-- steady-state churn is minimal — important because unified_tags has an
-- AFTER UPDATE search_documents_sync trigger + an audit-log trigger that fan
-- out per changed row. First run rescORES all active tags once.
-- Scoped to status='active' (deprecated/merged excluded from enrichment).
-- ============================================================================

-- ===== 1. columns =====
ALTER TABLE public.unified_tags
  ADD COLUMN IF NOT EXISTS quality_score     numeric,
  ADD COLUMN IF NOT EXISTS quality_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS last_quality_at   timestamptz;

COMMENT ON COLUMN public.unified_tags.quality_score IS
  'Composite content-quality score 0-100 (run_tag_quality_recompute). Completeness of description/image/category/i18n/links/usage/embedding.';
COMMENT ON COLUMN public.unified_tags.quality_breakdown IS
  'Per-dimension components (0..1) behind quality_score: desc, image, category, i18n, links, used, embedding.';

-- ===== 2. recompute (pure SQL, nightly) =====
-- Weights (sum 1.0):
--   description 0.22 | image 0.13 | category 0.15 | i18n 0.15 |
--   links(wikidata/wikipedia) 0.10 | used-in-content 0.15 | embedding 0.10
-- i18n coverage = fraction of the 11 supported locales present in description_i18n.
CREATE OR REPLACE FUNCTION public.run_tag_quality_recompute()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_changed       int := 0;
  v_examined      int := 0;
  v_locales       text[] := ARRAY['de','fr','es','it','pt','nl','pl','ru','tr','uk','sv'];
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'tag_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'tag_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  WITH scope AS (
    SELECT t.id, t.description, t.image_url, t.category_id, t.description_i18n,
           t.wikidata_id, t.wikipedia_url
    FROM public.unified_tags t
    WHERE t.status = 'active'
  ),
  comp AS (
    SELECT s.id,
      -- description: adequate >=30 chars -> 1.0, stub -> 0.4, none -> 0
      CASE WHEN s.description IS NULL OR length(trim(s.description))=0 THEN 0.0
           WHEN length(trim(s.description)) < 30 THEN 0.4
           ELSE 1.0 END                                                          AS c_desc,
      CASE WHEN s.image_url IS NULL OR s.image_url='' THEN 0.0 ELSE 1.0 END      AS c_image,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_category,
      -- i18n: fraction of supported locales present (non-empty) in description_i18n
      (SELECT count(*) FROM unnest(v_locales) l
         WHERE coalesce(s.description_i18n ->> l,'') <> '')::numeric
         / array_length(v_locales,1)                                             AS c_i18n,
      CASE WHEN s.wikidata_id IS NOT NULL OR s.wikipedia_url IS NOT NULL
           THEN 1.0 ELSE 0.0 END                                                 AS c_links,
      CASE WHEN EXISTS (SELECT 1 FROM public.unified_tag_assignments u WHERE u.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_used,
      CASE WHEN EXISTS (SELECT 1 FROM public.tag_embeddings e WHERE e.tag_id=s.id)
           THEN 1.0 ELSE 0.0 END                                                 AS c_embed
    FROM scope s
  ),
  final AS (
    SELECT id,
      round(100 * (0.22*c_desc + 0.13*c_image + 0.15*c_category + 0.15*c_i18n
                 + 0.10*c_links + 0.15*c_used + 0.10*c_embed))::numeric          AS new_score,
      jsonb_build_object(
        'desc', round(c_desc,2), 'image', round(c_image,2), 'category', round(c_category,2),
        'i18n', round(c_i18n,2), 'links', round(c_links,2), 'used', round(c_used,2),
        'embedding', round(c_embed,2)
      )                                                                          AS breakdown
    FROM comp
  )
  UPDATE public.unified_tags t
    SET quality_score = f.new_score,
        quality_breakdown = f.breakdown,
        last_quality_at = now()
  FROM final f
  WHERE t.id = f.id
    AND (t.quality_score IS DISTINCT FROM f.new_score
         OR t.quality_breakdown IS DISTINCT FROM f.breakdown);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.unified_tags WHERE status='active';

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
ALTER FUNCTION public.run_tag_quality_recompute() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_tag_quality_recompute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_tag_quality_recompute() TO service_role, authenticated;

-- ===== 3. scorecard RPC (read-only, admin) =====
-- Aggregate view for the admin panel: totals, per-dimension gap counts, score buckets.
CREATE OR REPLACE FUNCTION public.tag_quality_scorecard()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT * FROM public.unified_tags WHERE status='active')
  SELECT jsonb_build_object(
    'active_total', (SELECT count(*) FROM a),
    'mean_score', (SELECT round(avg(quality_score),1) FROM a WHERE quality_score IS NOT NULL),
    'scored', (SELECT count(*) FROM a WHERE quality_score IS NOT NULL),
    'gaps', jsonb_build_object(
      'description', (SELECT count(*) FROM a WHERE (quality_breakdown->>'desc')::numeric < 1),
      'image',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'image')::numeric < 1),
      'category',   (SELECT count(*) FROM a WHERE (quality_breakdown->>'category')::numeric < 1),
      'i18n',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'i18n')::numeric < 1),
      'links',      (SELECT count(*) FROM a WHERE (quality_breakdown->>'links')::numeric < 1),
      'used',       (SELECT count(*) FROM a WHERE (quality_breakdown->>'used')::numeric < 1),
      'embedding',  (SELECT count(*) FROM a WHERE (quality_breakdown->>'embedding')::numeric < 1)
    ),
    'buckets', jsonb_build_object(
      'p0_20',  (SELECT count(*) FROM a WHERE quality_score < 20),
      'p20_40', (SELECT count(*) FROM a WHERE quality_score >= 20 AND quality_score < 40),
      'p40_60', (SELECT count(*) FROM a WHERE quality_score >= 40 AND quality_score < 60),
      'p60_80', (SELECT count(*) FROM a WHERE quality_score >= 60 AND quality_score < 80),
      'p80_100',(SELECT count(*) FROM a WHERE quality_score >= 80)
    ),
    'sensitive_unreviewed', (SELECT count(*) FROM a WHERE (is_sensitive OR is_adult) AND human_reviewed IS NOT TRUE)
  );
$$;
ALTER FUNCTION public.tag_quality_scorecard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tag_quality_scorecard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tag_quality_scorecard() TO service_role, authenticated;

-- ===== 4. register automation (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('tag_quality_recompute','Recompute tag quality scores',
   'Nightly composite content-quality score for active tags (description/image/category/i18n/links/usage/embedding).',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_tag_quality_recompute"}'::jsonb, '15 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 5. extend dispatch RPCs =====
-- NOTE: these CREATE OR REPLACE the full live dispatchers. All pre-existing
-- slugs (event_*, venue_coord_snap, city_*) are preserved verbatim; only the
-- tag_quality_recompute branch is new. Keep in sync if more slugs are added.
CREATE OR REPLACE FUNCTION public.admin_automation_run(p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_slug = 'event_auto_archive' THEN v_result := public.run_event_auto_archive();
  ELSIF p_slug = 'staging_auto_reject_stale' THEN v_result := public.run_staging_auto_reject_stale();
  ELSIF p_slug = 'workflow_runs_purge' THEN v_result := public.run_workflow_runs_purge();
  ELSIF p_slug = 'enrichment_log_purge' THEN v_result := public.run_enrichment_log_purge();
  ELSIF p_slug = 'event_trust_recompute' THEN v_result := public.run_event_trust_recompute();
  ELSIF p_slug = 'event_coverage_radar' THEN v_result := public.run_event_coverage_radar();
  ELSIF p_slug = 'venue_coord_snap' THEN v_result := public.run_venue_coord_snap();
  ELSIF p_slug = 'city_trust_recompute' THEN v_result := public.run_city_trust_recompute();
  ELSIF p_slug = 'city_coverage_radar' THEN v_result := public.run_city_coverage_radar();
  ELSIF p_slug = 'city_completeness_recompute' THEN v_result := public.run_city_completeness_recompute();
  ELSIF p_slug = 'tag_quality_recompute' THEN v_result := public.run_tag_quality_recompute();
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
  ELSIF p_slug IN ('city_trust_recompute','city_completeness_recompute') THEN
    SELECT count(*) INTO v_examined FROM public.cities c
    WHERE c.duplicate_of_id IS NULL
      AND (c.last_verified_at IS NULL OR c.updated_at > c.last_verified_at OR c.last_verified_at < now() - interval '30 days');
  ELSIF p_slug = 'city_coverage_radar' THEN
    SELECT count(*) INTO v_examined FROM public.cities WHERE duplicate_of_id IS NULL;
  ELSIF p_slug = 'tag_quality_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.unified_tags WHERE status='active';
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 6. cron (no-op while paused: enabled=false short-circuits the fn) =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='tag_quality_recompute') THEN PERFORM cron.unschedule('tag_quality_recompute'); END IF;
END $$;
SELECT cron.schedule('tag_quality_recompute', '15 3 * * *', 'SELECT public.run_tag_quality_recompute();');
