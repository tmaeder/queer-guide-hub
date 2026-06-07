-- News Quality — Phase 0: measurement layer.
--
-- Gives committed news articles a live, always-fresh completeness signal plus a
-- single canonical scorecard, so the backfill (Phase 1) and gate-hardening
-- (Phase 2) work has a baseline to prove improvement against.
--
-- What this adds:
--   * news_completeness_score(...)   — immutable per-row rubric (ports computeNewsScore from pipeline-quality-score)
--   * run_news_quality_recompute()   — nightly pure-SQL recompute of news_articles.quality_score (0-100) over live rows
--   * news_quality_scorecard         — one-row global coverage snapshot for the admin panel
--   * news_quality_source_health     — FIX: existing view joined `venues` (wrong table) and returned 0 rows; rejoined to news_sources
--   * paused admin_automation + cron + dispatch wiring (mirrors event_trust_recompute)
--
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).

-- ===== 1. completeness rubric (immutable, reusable) =====
-- Mirrors computeNewsScore() in supabase/functions/pipeline-quality-score/index.ts:
-- title 15, content depth 30, image 15, author 10, excerpt 10, published_at 5, source 5, tags 10.
CREATE OR REPLACE FUNCTION public.news_completeness_score(
  p_title        text,
  p_content      text,
  p_excerpt      text,
  p_author       text,
  p_image_url    text,
  p_published_at timestamptz,
  p_source_id    uuid,
  p_tags         text[]
) RETURNS smallint
LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT
      coalesce(trim(p_title), '')                                                          AS title,
      trim(regexp_replace(regexp_replace(coalesce(p_content,''), '<[^>]+>', ' ', 'g'),
                          '\s+', ' ', 'g'))                                                AS body,
      coalesce(array_length(p_tags, 1), 0)                                                 AS ntags
  )
  SELECT least(100, (
      -- title (15)
      (CASE WHEN length(title) >= 10 THEN 5 ELSE 0 END)
    + (CASE WHEN length(title) >= 30 THEN 5 ELSE 0 END)
    + (CASE WHEN title ~ '\s' AND array_length(regexp_split_to_array(title, '\s+'), 1) >= 4 THEN 5 ELSE 0 END)
      -- content depth (30)
    + (CASE WHEN length(body) > 0   THEN 5  ELSE 0 END)
    + (CASE WHEN length(body) > 100 THEN 5  ELSE 0 END)
    + (CASE WHEN length(body) > 300 THEN 10 ELSE 0 END)
    + (CASE WHEN length(body) > 800 THEN 10 ELSE 0 END)
      -- image (15)
    + (CASE WHEN coalesce(trim(p_image_url),'') <> '' THEN 15 ELSE 0 END)
      -- author (10)
    + (CASE WHEN length(coalesce(trim(p_author),'')) > 2 THEN 10 ELSE 0 END)
      -- excerpt (10)
    + (CASE WHEN length(coalesce(trim(p_excerpt),'')) > 20 THEN 10 ELSE 0 END)
      -- published_at (5)
    + (CASE WHEN p_published_at IS NOT NULL THEN 5 ELSE 0 END)
      -- source (5)
    + (CASE WHEN p_source_id IS NOT NULL THEN 5 ELSE 0 END)
      -- tags (10)
    + (CASE WHEN ntags >= 1 THEN 5 ELSE 0 END)
    + (CASE WHEN ntags >= 3 THEN 5 ELSE 0 END)
  ))::smallint
  FROM s;
$$;
ALTER FUNCTION public.news_completeness_score(text,text,text,text,text,timestamptz,uuid,text[]) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.news_completeness_score(text,text,text,text,text,timestamptz,uuid,text[]) TO service_role, authenticated;

-- ===== 2. fix per-source health view (was joined to venues → 0 rows) =====
-- DROP first: the old view's column order differs, so CREATE OR REPLACE can't reshape it.
DROP VIEW IF EXISTS public.news_quality_source_health;
CREATE OR REPLACE VIEW public.news_quality_source_health AS
SELECT
  s.id          AS source_id,
  s.name        AS source_name,
  count(a.*)    AS total,
  count(*) FILTER (WHERE a.quality_status = 'passed')   AS passed,
  count(*) FILTER (WHERE a.quality_status = 'review')   AS review,
  count(*) FILTER (WHERE a.quality_status = 'rejected') AS rejected,
  count(*) FILTER (WHERE a.quality_status IS NULL)      AS legacy,
  avg(a.quality_score)   FILTER (WHERE a.quality_score IS NOT NULL)   AS avg_quality,
  avg(a.relevance_score) FILTER (WHERE a.relevance_score IS NOT NULL) AS avg_relevance,
  count(*) FILTER (WHERE coalesce(array_length(a.country_ids,1),0)=0) AS no_geo,
  count(*) FILTER (WHERE length(coalesce(a.content,'')) < 500)        AS thin,
  count(*) FILTER (WHERE coalesce(array_length(a.tags,1),0)=0)        AS no_tags,
  CASE WHEN count(*) FILTER (WHERE a.quality_status IS NOT NULL) > 0
    THEN count(*) FILTER (WHERE a.quality_status = 'rejected')::numeric
       / count(*) FILTER (WHERE a.quality_status IS NOT NULL)::numeric
    ELSE NULL END AS reject_rate,
  s.reliability_score,
  s.is_active,
  s.auto_paused,
  max(a.last_quality_run_at) AS last_run_at
FROM public.news_sources s
JOIN public.news_articles a ON a.source_id = s.id AND a.duplicate_of_id IS NULL
GROUP BY s.id, s.name, s.reliability_score, s.is_active, s.auto_paused
HAVING count(*) > 0;

GRANT SELECT ON public.news_quality_source_health TO authenticated;

COMMENT ON VIEW public.news_quality_source_health IS
  'Per-source news quality + coverage breakdown (joined to news_sources). Sources with high reject_rate / no_geo / thin are candidates for review or disabling.';

-- ===== 3. global scorecard (one row) =====
CREATE OR REPLACE VIEW public.news_quality_scorecard AS
SELECT
  count(*)                                                              AS total_live,
  count(*) FILTER (WHERE coalesce(array_length(country_ids,1),0)=0)     AS no_geo,
  count(*) FILTER (WHERE coalesce(array_length(city_ids,1),0)=0)        AS no_city,
  count(*) FILTER (WHERE length(coalesce(trim(author),''))=0)           AS no_author,
  count(*) FILTER (WHERE length(coalesce(content,'')) < 200)            AS thin_lt200,
  count(*) FILTER (WHERE length(coalesce(content,'')) < 500)            AS thin_lt500,
  count(*) FILTER (WHERE coalesce(trim(image_url),'')='')               AS no_image,
  count(*) FILTER (WHERE coalesce(array_length(tags,1),0)=0)            AS no_tags,
  count(*) FILTER (WHERE length(coalesce(trim(excerpt),''))=0)          AS no_excerpt,
  round(avg(quality_score)::numeric, 1)                                 AS avg_quality,
  round(avg(relevance_score)::numeric, 3)                               AS avg_relevance,
  count(*) FILTER (WHERE quality_status='passed')                       AS qstatus_passed,
  count(*) FILTER (WHERE quality_status='review')                       AS qstatus_review,
  count(*) FILTER (WHERE quality_status='rejected')                     AS qstatus_rejected,
  count(*) FILTER (WHERE quality_status IS NULL)                        AS qstatus_null,
  count(*) FILTER (WHERE corroboration_count >= 2)                      AS corroborated,
  count(*) FILTER (WHERE published_at > now() - interval '30 days')     AS last_30d,
  count(*) FILTER (WHERE needs_attention)                              AS needs_attention,
  max(last_quality_run_at)                                              AS last_run_at
FROM public.news_articles
WHERE duplicate_of_id IS NULL;

GRANT SELECT ON public.news_quality_scorecard TO authenticated;

COMMENT ON VIEW public.news_quality_scorecard IS
  'One-row global coverage snapshot of live news (duplicate_of_id IS NULL) for the admin News Quality panel. Baseline for Phase 1 backfill / Phase 2 gate hardening.';

-- ===== 4. nightly completeness recompute (pure SQL) =====
CREATE OR REPLACE FUNCTION public.run_news_quality_recompute()
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
  FROM public.admin_automations WHERE slug = 'news_quality_recompute';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'news_quality_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  SELECT count(*) INTO v_examined FROM public.news_articles WHERE duplicate_of_id IS NULL;

  -- Only rows whose recomputed completeness differs are written, so steady-state
  -- runs touch ~0 rows and don't churn the search_documents sync trigger.
  WITH recomputed AS (
    SELECT id,
      public.news_completeness_score(title, content, excerpt, author, image_url,
                                     published_at, source_id, tags) AS new_score
    FROM public.news_articles
    WHERE duplicate_of_id IS NULL
  )
  UPDATE public.news_articles a
    SET quality_score = r.new_score,
        last_quality_run_at = now()
  FROM recomputed r
  WHERE a.id = r.id AND a.quality_score IS DISTINCT FROM r.new_score;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

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
ALTER FUNCTION public.run_news_quality_recompute() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_news_quality_recompute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_news_quality_recompute() TO service_role, authenticated;

-- ===== 5. register automation (PAUSED) =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('news_quality_recompute','Recompute news completeness scores',
   'Nightly pure-SQL recompute of news_articles.quality_score (0-100 completeness) over live articles. Keeps the score fresh as backfills fill missing fields.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_news_quality_recompute"}'::jsonb, '50 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ===== 6. extend dispatch RPCs (preserve all existing branches) =====
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
  ELSIF p_slug = 'news_quality_recompute' THEN v_result := public.run_news_quality_recompute();
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
  ELSIF p_slug = 'news_quality_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.news_articles WHERE duplicate_of_id IS NULL;
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

-- ===== 7. cron (no-op while automation paused) =====
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_quality_recompute') THEN
    PERFORM cron.unschedule('news_quality_recompute');
  END IF;
END $$;
SELECT cron.schedule('news_quality_recompute', '50 3 * * *', 'SELECT public.run_news_quality_recompute();');
