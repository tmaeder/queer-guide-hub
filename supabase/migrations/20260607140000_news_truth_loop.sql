-- News Quality — Phase 4: continuous News Truth Loop (pure-SQL core).
--
-- Mirrors the Event Truth Loop for news: a composite, decaying trust_score
-- recomputed nightly from completeness + corroboration + freshness + relevance
-- + admin feedback, an append-only signal ledger, and a refresh selector that
-- ranks the stalest / lowest-trust articles for re-enrichment.
--
-- Deferred (need an edge function / geo backfill, tracked separately):
--   * news-link-checker (dead-link liveness) — feeds a 'link_health' signal
--   * run_news_coverage_radar() — needs city_ids backfilled to be meaningful
--
-- Idempotent; safe to re-apply. No CONCURRENTLY (runs in a txn).

-- ===== 1. trust_score column =====
ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS trust_score      smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

COMMENT ON COLUMN public.news_articles.trust_score IS
  'Composite 0-100 trust from completeness+corroboration+freshness+relevance+admin feedback (run_news_trust_recompute). Distinct from quality_score (=completeness).';

CREATE INDEX IF NOT EXISTS idx_news_trust_score
  ON public.news_articles(trust_score) WHERE duplicate_of_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_news_last_verified
  ON public.news_articles(last_verified_at NULLS FIRST) WHERE duplicate_of_id IS NULL;

-- ===== 2. signal ledger =====
CREATE TABLE IF NOT EXISTS public.news_quality_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN
    ('corroboration','freshness','completeness','relevance','admin_feedback','link_health','engagement')),
  value       numeric(5,4) NOT NULL DEFAULT 0,
  weight      numeric(4,3) NOT NULL DEFAULT 1.000,
  source      text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_quality_signals_article
  ON public.news_quality_signals(article_id, signal_type, created_at DESC);

ALTER TABLE public.news_quality_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_quality_signals' AND policyname='nqs_read') THEN
    CREATE POLICY "nqs_read" ON public.news_quality_signals
      FOR SELECT TO authenticated USING (has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_quality_signals' AND policyname='nqs_admin_write') THEN
    CREATE POLICY "nqs_admin_write" ON public.news_quality_signals
      FOR ALL TO authenticated
      USING (has_any_role_jwt(ARRAY['admin'::app_role]))
      WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role]));
  END IF;
END $$;

-- ===== 3. nightly trust recompute (pure SQL) =====
CREATE OR REPLACE FUNCTION public.run_news_trust_recompute()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_changed int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'news_trust_recompute';
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'news_trust_recompute', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;
  IF v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- Bound work: only recent or never-verified live articles.
  WITH scope AS (
    SELECT id, quality_score, relevance_score, corroboration_count,
           published_at, updated_at, last_verified_at, needs_attention
    FROM public.news_articles
    WHERE duplicate_of_id IS NULL
      AND (published_at > now() - interval '90 days'
           OR last_verified_at IS NULL
           OR updated_at > now() - interval '2 days')
  ),
  adminfb AS (
    SELECT DISTINCT ON (article_id) article_id, value
    FROM public.news_quality_signals WHERE signal_type='admin_feedback'
    ORDER BY article_id, created_at DESC
  ),
  scored AS (
    SELECT s.id,
      least(1.0, greatest(0.0, coalesce(s.quality_score,0)/100.0))                         AS completeness,
      least(1.0, coalesce(s.corroboration_count,1)/3.0)                                    AS corroboration,
      exp(-greatest(0, extract(epoch FROM now()-coalesce(s.published_at,s.updated_at))/86400.0)/30.0) AS freshness,
      coalesce(s.relevance_score, 0.5)::numeric                                            AS relevance,
      coalesce(a.value, 0.5)                                                               AS admin_feedback,
      s.needs_attention
    FROM scope s LEFT JOIN adminfb a ON a.article_id=s.id
  ),
  final AS (
    SELECT id, round(100 * greatest(0.0, least(1.0,
        0.30*completeness + 0.20*corroboration + 0.20*freshness
      + 0.20*relevance     + 0.10*admin_feedback
      - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))::smallint AS new_trust
    FROM scored
  )
  UPDATE public.news_articles n
    SET trust_score = f.new_trust, last_verified_at = now()
  FROM final f
  WHERE n.id = f.id AND n.trust_score IS DISTINCT FROM f.new_trust;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  SELECT count(*) INTO v_examined FROM public.news_articles
  WHERE duplicate_of_id IS NULL
    AND (published_at > now() - interval '90 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');

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
ALTER FUNCTION public.run_news_trust_recompute() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_news_trust_recompute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_news_trust_recompute() TO service_role, authenticated;

-- ===== 4. refresh selector =====
-- Ranks live articles most in need of re-enrichment: never-verified first, then
-- lowest trust, then stalest. Drives a future targeted re-enrichment pass.
CREATE OR REPLACE FUNCTION public.news_due_for_refresh(p_limit int DEFAULT 100)
RETURNS TABLE(id uuid, title text, trust_score smallint, last_verified_at timestamptz, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, trust_score, last_verified_at, published_at
  FROM public.news_articles
  WHERE duplicate_of_id IS NULL
  ORDER BY last_verified_at NULLS FIRST, trust_score ASC, published_at ASC
  LIMIT greatest(1, least(p_limit, 1000));
$$;
ALTER FUNCTION public.news_due_for_refresh(int) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.news_due_for_refresh(int) TO service_role, authenticated;

-- ===== 5. register automation (PAUSED) + dispatch + cron =====
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('news_trust_recompute','Recompute news trust scores',
   'Nightly composite decaying trust_score from completeness+corroboration+freshness+relevance+admin feedback.',
   'system', false, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_news_trust_recompute"}'::jsonb, '55 3 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

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
  ELSIF p_slug = 'news_trust_recompute' THEN v_result := public.run_news_trust_recompute();
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
  ELSIF p_slug = 'news_trust_recompute' THEN
    SELECT count(*) INTO v_examined FROM public.news_articles
    WHERE duplicate_of_id IS NULL
      AND (published_at > now() - interval '90 days' OR last_verified_at IS NULL OR updated_at > now() - interval '2 days');
  ELSE RAISE EXCEPTION 'unknown automation slug: %', p_slug USING ERRCODE='22023'; END IF;
  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, finished_at, status, items_examined, items_changed, summary)
  VALUES (v_automation_id, p_slug, v_started_at, now(), 'dry_run', v_examined, 0,
          jsonb_build_object('mode','dry_run','would_change',v_examined));
  RETURN jsonb_build_object('would_change', v_examined);
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='news_trust_recompute') THEN
    PERFORM cron.unschedule('news_trust_recompute');
  END IF;
END $$;
SELECT cron.schedule('news_trust_recompute', '55 3 * * *', 'SELECT public.run_news_trust_recompute();');
