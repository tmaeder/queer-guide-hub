-- News quality pipeline follow-ups:
--   * news_quality_settings — single-row config (enabled, auto_publish, etc.)
--   * news_quality_health view — counts by status for /admin/pipelines health
--   * news_commit_staging_batch — also merge enriched country_ids/city_ids
--     into the article + junction tables so resolved links are queryable
--   * workflow_definitions — daily backfill cron (disabled by default)

-- ---------------------------------------------------------------
-- 1. news_quality_settings — operational kill-switch + per-flag toggles
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.news_quality_settings (
  id                          INT PRIMARY KEY DEFAULT 1
                              CHECK (id = 1), -- single-row table
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  auto_publish_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  image_replacement_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  notes                       TEXT,
  updated_by                  UUID REFERENCES auth.users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.news_quality_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.news_quality_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anyone read settings" ON public.news_quality_settings
    FOR SELECT TO authenticated, anon USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin manage settings" ON public.news_quality_settings
    FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.news_quality_settings IS
  'Single-row configuration for the news quality pipeline. Edge functions read enabled flag to short-circuit AI calls when disabled.';

-- ---------------------------------------------------------------
-- 2. news_quality_health — counts surfaced on admin pipelines page
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW public.news_quality_health AS
SELECT
  count(*) FILTER (WHERE quality_status = 'passed')   AS passed,
  count(*) FILTER (WHERE quality_status = 'review')   AS review,
  count(*) FILTER (WHERE quality_status = 'rejected') AS rejected,
  count(*) FILTER (WHERE quality_status = 'pending')  AS pending,
  count(*) FILTER (WHERE quality_status IS NULL)      AS legacy_unprocessed,
  count(*)                                            AS total,
  avg(relevance_score) FILTER (WHERE relevance_score IS NOT NULL) AS avg_relevance,
  avg(quality_score)   FILTER (WHERE quality_score IS NOT NULL)   AS avg_quality_after,
  avg(quality_score - quality_score_before)
    FILTER (WHERE quality_score IS NOT NULL AND quality_score_before IS NOT NULL) AS avg_quality_delta,
  max(last_quality_run_at) AS last_run_at
FROM public.news_articles;

GRANT SELECT ON public.news_quality_health TO authenticated;

-- ---------------------------------------------------------------
-- 3. Commit RPC — also persist resolved entity IDs to junction tables
--    Reuses the v2 body from 20260427220000 and adds country/city
--    junction writes after the article row exists.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.news_commit_staging_batch(
  p_job_id UUID,
  p_pipeline_run_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 500
) RETURNS TABLE(inserted INT, updated INT, skipped INT, errors INT, details JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_inserted INT := 0; v_updated INT := 0; v_skipped INT := 0; v_errors INT := 0;
  v_row RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB; v_dates JSONB; v_urls JSONB; v_images JSONB;
  v_fp TEXT; v_existing_id UUID;
  v_published TIMESTAMPTZ; v_source_id UUID; v_title TEXT; v_url TEXT;
  v_content TEXT; v_image TEXT; v_excerpt TEXT;
  v_target_id UUID; v_action TEXT; v_details JSONB := '[]'::JSONB;
  v_quality_status TEXT; v_relevance NUMERIC; v_quality_after NUMERIC;
  v_quality_before NUMERIC; v_sentiment TEXT; v_blocked_reasons TEXT[];
  v_pipeline_ver TEXT;
  v_country_ids UUID[]; v_city_ids UUID[];
BEGIN
  FOR v_row IN
    SELECT id, normalized_data, enriched_data, raw_data, source_name
      FROM public.ingestion_staging
     WHERE job_id = p_job_id AND target_table = 'news_articles' AND disposition = 'pending'
       AND coalesce(dedup_status, 'pending') IN ('pending','unique','merge_candidate','duplicate')
       AND coalesce(ai_validation_status,'pending') IN ('pending','approved','needs_review')
     ORDER BY created_at LIMIT p_limit
  LOOP
    BEGIN
      v_norm := coalesce(v_row.normalized_data, v_row.raw_data, '{}'::JSONB);
      v_enr  := coalesce(v_row.enriched_data, '{}'::JSONB);
      v_meta := coalesce(v_norm->'metadata', '{}'::JSONB);
      v_dates := coalesce(v_norm->'dates', '{}'::JSONB);
      v_urls := coalesce(v_norm->'urls', '[]'::JSONB);
      v_images := coalesce(v_norm->'images', '[]'::JSONB);

      v_title := nullif(trim(coalesce(v_norm->>'title', v_norm->>'name', '')), '');
      v_url := nullif(trim(coalesce(
        v_norm->>'url',
        CASE WHEN jsonb_array_length(v_urls) > 0 THEN v_urls->>0 ELSE NULL END,
        v_meta->>'url'
      )), '');
      v_content := coalesce(v_norm->>'content', v_norm->>'description', '');
      v_image := coalesce(
        v_norm->>'image_url',
        CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images->>0 ELSE NULL END,
        v_meta->>'image_url'
      );
      v_excerpt := coalesce(v_norm->>'excerpt', v_meta->>'excerpt');
      v_published := coalesce(
        nullif(v_norm->>'published_at','')::TIMESTAMPTZ,
        nullif(v_dates->>'start','')::TIMESTAMPTZ,
        nullif(v_meta->>'published_at','')::TIMESTAMPTZ,
        now()
      );
      v_source_id := coalesce(
        nullif(v_norm->>'source_id','')::UUID,
        nullif(v_meta->>'source_id','')::UUID
      );

      v_quality_status  := nullif(v_enr->>'quality_status', '');
      v_relevance       := nullif(v_enr->>'relevance_score', '')::NUMERIC;
      v_quality_after   := nullif(v_enr->>'quality_score_after', '')::NUMERIC;
      v_quality_before  := nullif(v_enr->>'quality_score_before', '')::NUMERIC;
      v_sentiment       := nullif(v_enr->>'sentiment', '');
      v_pipeline_ver    := nullif(v_enr->>'quality_pipeline_version', '');
      v_blocked_reasons := CASE
        WHEN jsonb_typeof(v_enr->'auto_publish_blocked_reasons') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_enr->'auto_publish_blocked_reasons'))
        ELSE NULL
      END;

      -- Resolved entity IDs come either from quality-enhance (preferred) or normalized_data (legacy).
      v_country_ids := coalesce(
        CASE WHEN jsonb_typeof(v_enr->'country_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'country_ids'))::UUID) END,
        CASE WHEN jsonb_typeof(v_norm->'country_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'country_ids'))::UUID) END,
        '{}'::UUID[]
      );
      v_city_ids := coalesce(
        CASE WHEN jsonb_typeof(v_enr->'city_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'city_ids'))::UUID) END,
        CASE WHEN jsonb_typeof(v_norm->'city_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'city_ids'))::UUID) END,
        '{}'::UUID[]
      );

      IF v_title IS NULL OR v_source_id IS NULL THEN
        UPDATE public.ingestion_staging
           SET disposition = 'rejected',
               error_message = 'missing title or source_id',
               processed_at = now()
         WHERE id = v_row.id;
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      v_fp := public.news_compute_fingerprint(v_title, v_published, v_source_id, v_url);
      v_existing_id := NULL;
      IF v_fp IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.news_articles WHERE fingerprint = v_fp LIMIT 1;
      END IF;
      IF v_existing_id IS NULL AND v_url IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.news_articles WHERE url = v_url LIMIT 1;
      END IF;

      IF v_existing_id IS NULL THEN
        INSERT INTO public.news_articles (
          source_id, title, content, excerpt, url, image_url, author,
          published_at, category, tags, country_ids, city_ids,
          fingerprint, content_hash, ingestion_run_id, ingestion_staging_id,
          slug, publisher_name, first_seen_at, last_seen_at, seen_count,
          quality_status, relevance_score, quality_score, quality_score_before,
          sentiment, quality_decision, quality_pipeline_version,
          last_quality_run_at, auto_publish_blocked_reasons
        ) VALUES (
          v_source_id, v_title, v_content,
          left(coalesce(v_excerpt, v_content), 500),
          coalesce(v_url, 'staging://' || v_row.id::TEXT),
          v_image,
          coalesce(v_norm->>'author', v_meta->>'author'),
          v_published,
          coalesce(nullif(v_norm->>'category',''), 'general'),
          coalesce(ARRAY(SELECT jsonb_array_elements_text(v_norm->'tags')), '{}'::TEXT[]),
          v_country_ids,
          v_city_ids,
          v_fp,
          encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex'),
          p_pipeline_run_id, v_row.id,
          coalesce(nullif(v_norm->>'slug',''),
                   substr(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 1, 240)
                     || '-' || substr(coalesce(v_fp, gen_random_uuid()::TEXT), 1, 8)),
          coalesce(nullif(v_norm->>'publisher_name',''), v_row.source_name),
          now(), now(), 1,
          v_quality_status, v_relevance, v_quality_after, v_quality_before,
          v_sentiment, v_enr->'quality_decision', v_pipeline_ver,
          CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE NULL END,
          v_blocked_reasons
        ) RETURNING id INTO v_target_id;
        v_inserted := v_inserted + 1; v_action := 'inserted';
      ELSE
        UPDATE public.news_articles
           SET title = coalesce(v_title, title),
               content = coalesce(nullif(v_content,''), content),
               excerpt = coalesce(nullif(v_excerpt,''), excerpt),
               image_url = coalesce(v_image, image_url),
               author = coalesce(v_norm->>'author', v_meta->>'author', author),
               published_at = LEAST(published_at, v_published),
               last_seen_at = now(), seen_count = coalesce(seen_count,1) + 1,
               fingerprint = coalesce(fingerprint, v_fp),
               content_hash = coalesce(content_hash, encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex')),
               -- Union new resolved IDs with existing arrays (ARRAY operations dedupe via DISTINCT below).
               country_ids = ARRAY(SELECT DISTINCT unnest(coalesce(country_ids,'{}'::UUID[]) || v_country_ids)),
               city_ids    = ARRAY(SELECT DISTINCT unnest(coalesce(city_ids,'{}'::UUID[])    || v_city_ids)),
               quality_status            = coalesce(v_quality_status, quality_status),
               relevance_score           = coalesce(v_relevance, relevance_score),
               quality_score             = coalesce(v_quality_after, quality_score),
               quality_score_before      = coalesce(v_quality_before, quality_score_before),
               sentiment                 = coalesce(v_sentiment, sentiment),
               quality_decision          = coalesce(v_enr->'quality_decision', quality_decision),
               quality_pipeline_version  = coalesce(v_pipeline_ver, quality_pipeline_version),
               last_quality_run_at       = CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE last_quality_run_at END,
               auto_publish_blocked_reasons = coalesce(v_blocked_reasons, auto_publish_blocked_reasons),
               updated_at = now()
         WHERE id = v_existing_id RETURNING id INTO v_target_id;
        v_updated := v_updated + 1; v_action := 'updated';
      END IF;

      -- Junction tables: insert any country/city ids not already linked (ignore conflicts).
      IF array_length(v_country_ids, 1) > 0 THEN
        INSERT INTO public.news_article_countries (article_id, country_id)
        SELECT v_target_id, cid FROM unnest(v_country_ids) AS cid
        ON CONFLICT (article_id, country_id) DO NOTHING;
      END IF;
      IF array_length(v_city_ids, 1) > 0 THEN
        INSERT INTO public.news_article_cities (article_id, city_id)
        SELECT v_target_id, cid FROM unnest(v_city_ids) AS cid
        ON CONFLICT (article_id, city_id) DO NOTHING;
      END IF;

      UPDATE public.ingestion_staging
         SET disposition = v_action, target_record_id = v_target_id, processed_at = now()
       WHERE id = v_row.id;

      v_details := v_details || jsonb_build_object(
        'staging_id', v_row.id,
        'article_id', v_target_id,
        'action', v_action,
        'fingerprint', v_fp,
        'quality_status', v_quality_status,
        'countries_linked', array_length(v_country_ids, 1),
        'cities_linked', array_length(v_city_ids, 1)
      );
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      UPDATE public.ingestion_staging
         SET disposition = 'error', error_message = SQLERRM, processed_at = now()
       WHERE id = v_row.id;
    END;
  END LOOP;
  RETURN QUERY SELECT v_inserted, v_updated, v_skipped, v_errors, v_details;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Backfill cron — daily, disabled by default
-- ---------------------------------------------------------------

INSERT INTO public.workflow_definitions
  (name, display_name, description, edge_function, queue_name, schedule, default_payload,
   is_enabled, max_concurrency, max_retries, timeout_seconds, priority, tags)
VALUES
  ('news-quality-backfill',
   'News Quality Backfill',
   'Daily reprocess of existing news_articles through pipeline-quality-enhance. Disabled by default; flip is_enabled=true after spot-checking dry-run results.',
   'news-quality-backfill',
   'scheduled_jobs',
   '0 4 * * *',
   '{"action":"run","batch_size":20}'::jsonb,
   FALSE, 1, 2, 300, 50,
   ARRAY['news','quality','backfill'])
ON CONFLICT (name) DO NOTHING;
