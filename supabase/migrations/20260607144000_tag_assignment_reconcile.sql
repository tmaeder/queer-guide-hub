-- ============================================================================
-- Tag Content-Quality: Phase 3 — connect tags to content (orphan fix)
-- ----------------------------------------------------------------------------
-- Entities (venues, news_articles, community_groups) carry free-text tags[]
-- arrays that were never reconciled to the normalized unified_tags glossary, so
-- only 243 of 3,622 active tags ever surfaced any content. This reconciler maps
-- each entity's tags[] strings -> unified_tags via name / slug / alias match
-- (tag_aliases does the heavy lifting) and upserts unified_tag_assignments, then
-- recomputes the stale usage_count. Idempotent (ON CONFLICT DO NOTHING) and
-- registered as a recurring automation so newly-ingested content stays linked.
--
-- entity_type values match what get_tag_linked_content() reads:
--   venues -> 'venues', news_articles -> 'news', community_groups -> 'community_group'.
-- Personalities already resolve via tags[] array-overlap in that RPC (no rows here).
-- Events have no tags[] column, so they are out of scope.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_tag_assignment_reconcile()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_added         int := 0;
  v_tmp           int := 0;
  v_usage_changed int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'tag_assignment_reconcile';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'tag_assignment_reconcile', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Canonical lookup: free-text key -> tag_id, preferring name > slug > alias.
  CREATE TEMP TABLE _canon ON COMMIT DROP AS
  SELECT DISTINCT ON (k) k, tag_id FROM (
    SELECT lower(name) AS k, id AS tag_id, 1 AS pri FROM public.unified_tags
      WHERE status='active' AND merged_into_id IS NULL
    UNION ALL
    SELECT lower(slug), id, 2 FROM public.unified_tags
      WHERE status='active' AND merged_into_id IS NULL
    UNION ALL
    SELECT lower(alias_name), canonical_tag_id, 3 FROM public.tag_aliases a
      JOIN public.unified_tags t ON t.id=a.canonical_tag_id
      WHERE t.status='active' AND t.merged_into_id IS NULL
  ) s
  WHERE k IS NOT NULL AND k <> ''
  ORDER BY k, pri;
  CREATE INDEX ON _canon (k);

  -- venues
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, v.id, 'venues'
  FROM public.venues v
  CROSS JOIN LATERAL unnest(v.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE v.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- news_articles
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, n.id, 'news'
  FROM public.news_articles n
  CROSS JOIN LATERAL unnest(n.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE n.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- community_groups
  INSERT INTO public.unified_tag_assignments (tag_id, entity_id, entity_type)
  SELECT DISTINCT c.tag_id, g.id, 'community_group'
  FROM public.community_groups g
  CROSS JOIN LATERAL unnest(g.tags) AS tag
  JOIN _canon c ON c.k = lower(trim(tag))
  WHERE g.tags IS NOT NULL AND trim(tag) <> ''
  ON CONFLICT (tag_id, entity_id, entity_type) DO NOTHING;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_added := v_added + v_tmp;

  -- Recompute real usage_count from content assignments (exclude tag-to-tag links).
  WITH counts AS (
    SELECT tag_id, count(*) AS n
    FROM public.unified_tag_assignments
    WHERE entity_type <> 'tag'
    GROUP BY tag_id
  )
  UPDATE public.unified_tags t
    SET usage_count = coalesce(c.n, 0)
  FROM (
    SELECT t2.id, c2.n FROM public.unified_tags t2
    LEFT JOIN counts c2 ON c2.tag_id = t2.id
  ) c
  WHERE t.id = c.id AND t.usage_count IS DISTINCT FROM coalesce(c.n, 0);
  GET DIAGNOSTICS v_usage_changed = ROW_COUNT;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_changed=v_added,
        summary=jsonb_build_object('assignments_added',v_added,'usage_recomputed',v_usage_changed)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('assignments_added',v_added,'usage_recomputed',v_usage_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;
ALTER FUNCTION public.run_tag_assignment_reconcile() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_tag_assignment_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_tag_assignment_reconcile() TO service_role, authenticated;

-- register automation (enabled; pure-SQL, idempotent, no external calls)
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('tag_assignment_reconcile','Reconcile entity tags to glossary',
   'Maps venue/news/group free-text tags[] to unified_tags via name/slug/alias, upserts unified_tag_assignments, recomputes usage_count.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_tag_assignment_reconcile"}'::jsonb, '45 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- extend dispatch RPCs with the new slug (preserves all existing slugs)
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
  ELSIF p_slug = 'tag_assignment_reconcile' THEN v_result := public.run_tag_assignment_reconcile();
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
  ELSIF p_slug = 'tag_assignment_reconcile' THEN
    SELECT count(*) INTO v_examined FROM public.venues WHERE tags IS NOT NULL AND array_length(tags,1) > 0;
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- cron
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='tag_assignment_reconcile') THEN PERFORM cron.unschedule('tag_assignment_reconcile'); END IF;
END $$;
SELECT cron.schedule('tag_assignment_reconcile', '45 3 * * *', 'SELECT public.run_tag_assignment_reconcile();');
