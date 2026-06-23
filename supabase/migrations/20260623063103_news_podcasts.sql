-- News podcasts: ingest podcast episodes as news_articles rows (media_type='podcast').
-- Episodes stream the feed's own enclosure URL (no re-hosting). A per-source feed_type
-- flag gates podcast parsing in source-rss-news so normal news feeds are unaffected.
-- Mixed into the main news feed + a "Podcasts" filter chip on the frontend.

-- ── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS feed_type text NOT NULL DEFAULT 'news';  -- 'news' | 'podcast'

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'article',  -- 'article' | 'podcast'
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

CREATE INDEX IF NOT EXISTS idx_news_articles_podcast
  ON public.news_articles (published_at DESC) WHERE media_type = 'podcast';

-- ── 2. Eligibility selector returns feed_type ──────────────────────────────
DROP FUNCTION IF EXISTS public.news_sources_eligible(integer);
CREATE FUNCTION public.news_sources_eligible(p_limit integer DEFAULT 50)
  RETURNS TABLE(id uuid, name text, url text, source_type text, category text,
                fetch_frequency integer, last_fetched_at timestamptz, keywords text[],
                feed_type text)
  LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT s.id, s.name, s.url, s.source_type, s.category,
         s.fetch_frequency, s.last_fetched_at, s.keywords, s.feed_type
    FROM public.news_sources s
   WHERE s.is_active = true
     AND s.auto_paused = false
     AND (s.backoff_until IS NULL OR s.backoff_until <= now())
     AND (s.last_fetched_at IS NULL
          OR s.last_fetched_at < now() - (coalesce(s.fetch_frequency,60) || ' minutes')::INTERVAL)
   ORDER BY s.reliability_score DESC NULLS LAST, s.last_fetched_at ASC NULLS FIRST
   LIMIT p_limit;
$$;
GRANT ALL ON FUNCTION public.news_sources_eligible(integer) TO anon, authenticated, service_role;

-- ── 3. Batch commit RPC: persist podcast media fields ──────────────────────
CREATE OR REPLACE FUNCTION public.news_commit_staging_batch(p_job_id uuid, p_pipeline_run_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 500)
 RETURNS TABLE(inserted integer, updated integer, skipped integer, errors integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_inserted INT := 0; v_updated INT := 0; v_skipped INT := 0; v_errors INT := 0;
  v_row RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB; v_dates JSONB; v_urls JSONB; v_images JSONB;
  v_fp TEXT; v_existing_id UUID;
  v_published TIMESTAMPTZ; v_source_id UUID; v_title TEXT; v_url TEXT;
  v_content TEXT; v_image TEXT; v_image_attribution TEXT; v_image_hash TEXT; v_excerpt TEXT;
  v_lang TEXT;
  v_media_type TEXT; v_audio_url TEXT; v_duration INT;
  v_target_id UUID; v_action TEXT; v_details JSONB := '[]'::JSONB;
  v_quality_status TEXT; v_relevance NUMERIC; v_quality_after NUMERIC;
  v_quality_before NUMERIC; v_sentiment TEXT; v_blocked_reasons TEXT[];
  v_pipeline_ver TEXT;
  v_country_ids UUID[]; v_city_ids UUID[];
  v_review_items JSONB;
BEGIN
  FOR v_row IN
    SELECT id, normalized_data, enriched_data, raw_data, source_name
      FROM public.ingestion_staging
     WHERE job_id = p_job_id AND target_table = 'news_articles' AND disposition = 'pending'
       AND coalesce(dedup_status, 'pending') IN ('pending','unique','merge_candidate','duplicate')
       AND coalesce(ai_validation_status,'pending') IN ('pending','approved','needs_review')
       AND NOT (
         coalesce(enrichment_status,'') = 'enriched'
         AND coalesce(enriched_data->>'quality_status','') = ''
         AND created_at > now() - interval '2 hours'
       )
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
      v_url := nullif(trim(coalesce(v_norm->>'url',
        CASE WHEN jsonb_array_length(v_urls) > 0 THEN v_urls->>0 ELSE NULL END,
        v_meta->>'url')), '');
      v_content := coalesce(v_norm->>'content', v_norm->>'description', '');
      v_image := coalesce(nullif(v_enr->>'image_url', ''), v_norm->>'image_url',
        CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images->>0 ELSE NULL END,
        v_meta->>'image_url');
      v_image_attribution := nullif(v_enr->>'image_attribution', '');
      v_image_hash := nullif(v_enr->>'image_hash', '');
      v_excerpt := coalesce(v_norm->>'excerpt', v_meta->>'excerpt');
      v_lang := nullif(lower(split_part(coalesce(v_norm->>'lang', v_meta->>'lang', ''), '-', 1)), '');
      v_media_type := coalesce(nullif(v_meta->>'media_type',''), 'article');
      v_audio_url := nullif(v_meta->>'audio_url','');
      v_duration := nullif(v_meta->>'duration_seconds','')::INT;
      v_published := coalesce(
        nullif(v_norm->>'published_at','')::TIMESTAMPTZ,
        nullif(v_dates->>'start','')::TIMESTAMPTZ,
        nullif(v_meta->>'published_at','')::TIMESTAMPTZ, now());
      v_source_id := coalesce(nullif(v_norm->>'source_id','')::UUID, nullif(v_meta->>'source_id','')::UUID);
      v_quality_status := nullif(v_enr->>'quality_status', '');
      v_relevance := nullif(v_enr->>'relevance_score', '')::NUMERIC;
      v_quality_after := nullif(v_enr->>'quality_score_after', '')::NUMERIC;
      v_quality_before := nullif(v_enr->>'quality_score_before', '')::NUMERIC;
      v_sentiment := nullif(v_enr->>'sentiment', '');
      v_pipeline_ver := nullif(v_enr->>'quality_pipeline_version', '');
      v_blocked_reasons := CASE WHEN jsonb_typeof(v_enr->'auto_publish_blocked_reasons') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_enr->'auto_publish_blocked_reasons')) ELSE NULL END;
      v_country_ids := coalesce(
        CASE WHEN jsonb_typeof(v_enr->'country_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'country_ids'))::UUID) END,
        CASE WHEN jsonb_typeof(v_norm->'country_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'country_ids'))::UUID) END,
        '{}'::UUID[]);
      v_city_ids := coalesce(
        CASE WHEN jsonb_typeof(v_enr->'city_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'city_ids'))::UUID) END,
        CASE WHEN jsonb_typeof(v_norm->'city_ids') = 'array'
          THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'city_ids'))::UUID) END,
        '{}'::UUID[]);
      v_review_items := v_enr->'quality_resolved_links'->'review';

      IF v_title IS NULL OR v_source_id IS NULL THEN
        UPDATE public.ingestion_staging SET disposition = 'rejected',
          error_message = 'missing title or source_id', processed_at = now() WHERE id = v_row.id;
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      v_fp := public.news_compute_fingerprint(v_title, v_published, v_source_id, v_url);
      v_existing_id := NULL;
      IF v_fp IS NOT NULL THEN SELECT id INTO v_existing_id FROM public.news_articles WHERE fingerprint = v_fp LIMIT 1; END IF;
      IF v_existing_id IS NULL AND v_url IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.news_articles WHERE url = v_url LIMIT 1; END IF;

      IF v_existing_id IS NULL THEN
        INSERT INTO public.news_articles (
          source_id, title, content, excerpt, url, image_url, image_attribution, image_hash, author,
          published_at, category, tags, country_ids, city_ids, content_language,
          media_type, audio_url, duration_seconds,
          fingerprint, content_hash, ingestion_run_id, ingestion_staging_id,
          slug, publisher_name, first_seen_at, last_seen_at, seen_count,
          quality_status, relevance_score, quality_score, quality_score_before,
          sentiment, quality_decision, quality_pipeline_version,
          last_quality_run_at, auto_publish_blocked_reasons
        ) VALUES (
          v_source_id, v_title, v_content,
          left(coalesce(v_excerpt, v_content), 500),
          coalesce(v_url, 'staging://' || v_row.id::TEXT), v_image, v_image_attribution, v_image_hash,
          coalesce(v_norm->>'author', v_meta->>'author'), v_published,
          coalesce(nullif(v_norm->>'category',''), 'general'),
          coalesce(ARRAY(SELECT jsonb_array_elements_text(v_norm->'tags')), '{}'::TEXT[]),
          v_country_ids, v_city_ids, v_lang,
          v_media_type, v_audio_url, v_duration,
          v_fp,
          encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex'),
          p_pipeline_run_id, v_row.id,
          coalesce(nullif(v_norm->>'slug',''),
            trim(both '-' from substr(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 1, 240))
              || '-' || substr(coalesce(v_fp, gen_random_uuid()::TEXT), 1, 8)),
          coalesce(nullif(v_norm->>'publisher_name',''), nullif(v_meta->>'publisher_name','')),
          now(), now(), 1,
          v_quality_status, v_relevance, v_quality_after, v_quality_before,
          v_sentiment, v_enr->'quality_decision', v_pipeline_ver,
          CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE NULL END,
          v_blocked_reasons
        ) RETURNING id INTO v_target_id;
        v_inserted := v_inserted + 1; v_action := 'inserted';
      ELSE
        UPDATE public.news_articles SET
          title = coalesce(v_title, title),
          content = coalesce(nullif(v_content,''), content),
          excerpt = coalesce(nullif(v_excerpt,''), excerpt),
          image_url = coalesce(v_image, image_url),
          image_attribution = coalesce(v_image_attribution, image_attribution),
          image_hash = coalesce(v_image_hash, image_hash),
          author = coalesce(v_norm->>'author', v_meta->>'author', author),
          content_language = coalesce(v_lang, content_language),
          media_type = coalesce(v_media_type, media_type),
          audio_url = coalesce(v_audio_url, audio_url),
          duration_seconds = coalesce(v_duration, duration_seconds),
          published_at = LEAST(published_at, v_published),
          last_seen_at = now(), seen_count = coalesce(seen_count,1) + 1,
          fingerprint = coalesce(fingerprint, v_fp),
          content_hash = coalesce(content_hash, encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex')),
          country_ids = ARRAY(SELECT DISTINCT unnest(coalesce(country_ids,'{}'::UUID[]) || v_country_ids)),
          city_ids    = ARRAY(SELECT DISTINCT unnest(coalesce(city_ids,'{}'::UUID[])    || v_city_ids)),
          quality_status = coalesce(v_quality_status, quality_status),
          relevance_score = coalesce(v_relevance, relevance_score),
          quality_score = coalesce(v_quality_after, quality_score),
          quality_score_before = coalesce(v_quality_before, quality_score_before),
          sentiment = coalesce(v_sentiment, sentiment),
          quality_decision = coalesce(v_enr->'quality_decision', quality_decision),
          quality_pipeline_version = coalesce(v_pipeline_ver, quality_pipeline_version),
          last_quality_run_at = CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE last_quality_run_at END,
          auto_publish_blocked_reasons = coalesce(v_blocked_reasons, auto_publish_blocked_reasons),
          updated_at = now()
        WHERE id = v_existing_id RETURNING id INTO v_target_id;
        v_updated := v_updated + 1; v_action := 'updated';
      END IF;

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

      IF jsonb_typeof(v_review_items) = 'array' AND jsonb_array_length(v_review_items) > 0 THEN
        INSERT INTO public.entity_link_review
          (article_id, entity_type, candidate_name, score, context_snippet)
        SELECT v_target_id, COALESCE(item->>'type', 'country'),
               item->>'name', (item->>'score')::NUMERIC, item->>'reason'
          FROM jsonb_array_elements(v_review_items) AS item
         WHERE item->>'name' IS NOT NULL;
      END IF;

      UPDATE public.ingestion_staging
        SET disposition = v_action, target_record_id = v_target_id, processed_at = now() WHERE id = v_row.id;

      v_details := v_details || jsonb_build_object(
        'staging_id', v_row.id, 'article_id', v_target_id, 'action', v_action,
        'fingerprint', v_fp, 'quality_status', v_quality_status,
        'image_hash_set', v_image_hash IS NOT NULL,
        'countries_linked', array_length(v_country_ids, 1),
        'cities_linked', array_length(v_city_ids, 1),
        'entity_review_items', CASE WHEN jsonb_typeof(v_review_items) = 'array' THEN jsonb_array_length(v_review_items) ELSE 0 END);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      UPDATE public.ingestion_staging SET disposition = 'error', error_message = SQLERRM, processed_at = now() WHERE id = v_row.id;
    END;
  END LOOP;
  RETURN QUERY SELECT v_inserted, v_updated, v_skipped, v_errors, v_details;
END; $function$;

-- ── 4. Individual review-commit RPC: persist podcast media fields ──────────
CREATE OR REPLACE FUNCTION public.commit_news_staging_item(p_staging_id uuid, p_actor text DEFAULT 'review:individual'::text)
 RETURNS TABLE(article_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB; v_dates JSONB; v_urls JSONB; v_images JSONB;
  v_fp TEXT; v_existing_id UUID;
  v_published TIMESTAMPTZ; v_source_id UUID; v_title TEXT; v_url TEXT;
  v_content TEXT; v_image TEXT; v_image_attribution TEXT; v_image_hash TEXT; v_excerpt TEXT;
  v_lang TEXT;
  v_media_type TEXT; v_audio_url TEXT; v_duration INT;
  v_target_id UUID; v_action TEXT;
  v_quality_status TEXT; v_relevance NUMERIC; v_quality_after NUMERIC;
  v_quality_before NUMERIC; v_sentiment TEXT; v_blocked_reasons TEXT[];
  v_pipeline_ver TEXT;
  v_country_ids UUID[]; v_city_ids UUID[];
  v_review_items JSONB;
BEGIN
  SELECT * INTO v_row FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_row.target_table <> 'news_articles' THEN
    RAISE EXCEPTION 'not_a_news_staging_item: target=%', v_row.target_table;
  END IF;
  IF v_row.disposition IN ('inserted','updated','committed','rejected') THEN
    article_id := v_row.target_record_id; action := 'noop'; RETURN NEXT; RETURN;
  END IF;

  v_norm := coalesce(v_row.normalized_data, v_row.raw_data, '{}'::JSONB);
  v_enr  := coalesce(v_row.enriched_data, '{}'::JSONB);
  v_meta := coalesce(v_norm->'metadata', '{}'::JSONB);
  v_dates := coalesce(v_norm->'dates', '{}'::JSONB);
  v_urls := coalesce(v_norm->'urls', '[]'::JSONB);
  v_images := coalesce(v_norm->'images', '[]'::JSONB);

  v_title := nullif(trim(coalesce(v_norm->>'title', v_norm->>'name', '')), '');
  v_url := nullif(trim(coalesce(v_norm->>'url',
    CASE WHEN jsonb_array_length(v_urls) > 0 THEN v_urls->>0 ELSE NULL END,
    v_meta->>'url')), '');
  v_content := coalesce(v_norm->>'content', v_norm->>'description', '');
  v_image := coalesce(nullif(v_enr->>'image_url', ''), v_norm->>'image_url',
    CASE WHEN jsonb_array_length(v_images) > 0 THEN v_images->>0 ELSE NULL END,
    v_meta->>'image_url');
  v_image_attribution := nullif(v_enr->>'image_attribution', '');
  v_image_hash := nullif(v_enr->>'image_hash', '');
  v_excerpt := coalesce(v_norm->>'excerpt', v_meta->>'excerpt');
  v_lang := nullif(lower(split_part(coalesce(v_norm->>'lang', v_meta->>'lang', ''), '-', 1)), '');
  v_media_type := coalesce(nullif(v_meta->>'media_type',''), 'article');
  v_audio_url := nullif(v_meta->>'audio_url','');
  v_duration := nullif(v_meta->>'duration_seconds','')::INT;
  v_published := coalesce(
    nullif(v_norm->>'published_at','')::TIMESTAMPTZ,
    nullif(v_dates->>'start','')::TIMESTAMPTZ,
    nullif(v_meta->>'published_at','')::TIMESTAMPTZ, now());
  v_source_id := coalesce(nullif(v_norm->>'source_id','')::UUID, nullif(v_meta->>'source_id','')::UUID);
  v_quality_status := nullif(v_enr->>'quality_status', '');
  v_relevance := nullif(v_enr->>'relevance_score', '')::NUMERIC;
  v_quality_after := nullif(v_enr->>'quality_score_after', '')::NUMERIC;
  v_quality_before := nullif(v_enr->>'quality_score_before', '')::NUMERIC;
  v_sentiment := nullif(v_enr->>'sentiment', '');
  v_pipeline_ver := nullif(v_enr->>'quality_pipeline_version', '');
  v_blocked_reasons := CASE WHEN jsonb_typeof(v_enr->'auto_publish_blocked_reasons') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(v_enr->'auto_publish_blocked_reasons')) ELSE NULL END;
  v_country_ids := coalesce(
    CASE WHEN jsonb_typeof(v_enr->'country_ids') = 'array'
      THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'country_ids'))::UUID) END,
    CASE WHEN jsonb_typeof(v_norm->'country_ids') = 'array'
      THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'country_ids'))::UUID) END,
    '{}'::UUID[]);
  v_city_ids := coalesce(
    CASE WHEN jsonb_typeof(v_enr->'city_ids') = 'array'
      THEN ARRAY(SELECT (jsonb_array_elements_text(v_enr->'city_ids'))::UUID) END,
    CASE WHEN jsonb_typeof(v_norm->'city_ids') = 'array'
      THEN ARRAY(SELECT (jsonb_array_elements_text(v_norm->'city_ids'))::UUID) END,
    '{}'::UUID[]);
  v_review_items := v_enr->'quality_resolved_links'->'review';

  IF v_title IS NULL OR v_source_id IS NULL THEN
    UPDATE public.ingestion_staging SET disposition = 'rejected',
      error_message = 'missing title or source_id', processed_at = now() WHERE id = v_row.id;
    article_id := NULL; action := 'rejected'; RETURN NEXT; RETURN;
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
      source_id, title, content, excerpt, url, image_url, image_attribution, image_hash, author,
      published_at, category, tags, country_ids, city_ids, content_language,
      media_type, audio_url, duration_seconds,
      fingerprint, content_hash, ingestion_staging_id,
      slug, publisher_name, first_seen_at, last_seen_at, seen_count,
      quality_status, relevance_score, quality_score, quality_score_before,
      sentiment, quality_decision, quality_pipeline_version,
      last_quality_run_at, auto_publish_blocked_reasons
    ) VALUES (
      v_source_id, v_title, v_content,
      left(coalesce(v_excerpt, v_content), 500),
      coalesce(v_url, 'staging://' || v_row.id::TEXT), v_image, v_image_attribution, v_image_hash,
      coalesce(v_norm->>'author', v_meta->>'author'), v_published,
      coalesce(nullif(v_norm->>'category',''), 'general'),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(v_norm->'tags')), '{}'::TEXT[]),
      v_country_ids, v_city_ids, v_lang,
      v_media_type, v_audio_url, v_duration,
      v_fp,
      encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex'),
      v_row.id,
      coalesce(nullif(v_norm->>'slug',''),
        trim(both '-' from substr(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 1, 240))
          || '-' || substr(coalesce(v_fp, gen_random_uuid()::TEXT), 1, 8)),
      coalesce(nullif(v_norm->>'publisher_name',''), v_row.source_name),
      now(), now(), 1,
      v_quality_status, v_relevance, v_quality_after, v_quality_before,
      v_sentiment, v_enr->'quality_decision', v_pipeline_ver,
      CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE NULL END,
      v_blocked_reasons
    ) RETURNING id INTO v_target_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.news_articles SET
      title = coalesce(v_title, title),
      content = coalesce(nullif(v_content,''), content),
      excerpt = coalesce(nullif(v_excerpt,''), excerpt),
      image_url = coalesce(v_image, image_url),
      image_attribution = coalesce(v_image_attribution, image_attribution),
      image_hash = coalesce(v_image_hash, image_hash),
      author = coalesce(v_norm->>'author', v_meta->>'author', author),
      content_language = coalesce(v_lang, content_language),
      media_type = coalesce(v_media_type, media_type),
      audio_url = coalesce(v_audio_url, audio_url),
      duration_seconds = coalesce(v_duration, duration_seconds),
      published_at = LEAST(published_at, v_published),
      last_seen_at = now(), seen_count = coalesce(seen_count,1) + 1,
      fingerprint = coalesce(fingerprint, v_fp),
      content_hash = coalesce(content_hash, encode(extensions.digest(convert_to(coalesce(v_content, v_title, ''), 'UTF8'), 'sha256'), 'hex')),
      country_ids = ARRAY(SELECT DISTINCT unnest(coalesce(country_ids,'{}'::UUID[]) || v_country_ids)),
      city_ids    = ARRAY(SELECT DISTINCT unnest(coalesce(city_ids,'{}'::UUID[])    || v_city_ids)),
      quality_status = coalesce(v_quality_status, quality_status),
      relevance_score = coalesce(v_relevance, relevance_score),
      quality_score = coalesce(v_quality_after, quality_score),
      quality_score_before = coalesce(v_quality_before, quality_score_before),
      sentiment = coalesce(v_sentiment, sentiment),
      quality_decision = coalesce(v_enr->'quality_decision', quality_decision),
      quality_pipeline_version = coalesce(v_pipeline_ver, quality_pipeline_version),
      last_quality_run_at = CASE WHEN v_quality_status IS NOT NULL THEN now() ELSE last_quality_run_at END,
      auto_publish_blocked_reasons = coalesce(v_blocked_reasons, auto_publish_blocked_reasons),
      updated_at = now()
    WHERE id = v_existing_id RETURNING id INTO v_target_id;
    v_action := 'updated';
  END IF;

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

  IF jsonb_typeof(v_review_items) = 'array' AND jsonb_array_length(v_review_items) > 0 THEN
    INSERT INTO public.entity_link_review (article_id, entity_type, candidate_name, score, context_snippet)
    SELECT v_target_id, COALESCE(item->>'type', 'country'),
           item->>'name', (item->>'score')::NUMERIC, item->>'reason'
      FROM jsonb_array_elements(v_review_items) AS item
     WHERE item->>'name' IS NOT NULL;
  END IF;

  UPDATE public.ingestion_staging
    SET disposition = v_action, target_record_id = v_target_id, processed_at = now()
   WHERE id = v_row.id;

  INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
  VALUES (v_row.id, 'commit', v_action, p_actor,
          jsonb_build_object('article_id', v_target_id, 'action', v_action, 'fingerprint', v_fp));

  article_id := v_target_id;
  action := v_action;
  RETURN NEXT;
END;
$function$;

-- ── 5. Front-page hotness RPC exposes podcast media ────────────────────────
DROP FUNCTION IF EXISTS public.get_news_front(integer, uuid[], uuid[], integer, boolean);
CREATE FUNCTION public.get_news_front(p_limit integer DEFAULT 60, p_country_ids uuid[] DEFAULT NULL::uuid[], p_city_ids uuid[] DEFAULT NULL::uuid[], p_window_days integer DEFAULT 21, p_personalized_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, slug text, title text, excerpt text, url text, image_url text, author text, published_at timestamptz, source_id uuid, views_count integer, is_featured boolean, is_premium boolean, country_ids uuid[], city_ids uuid[], tags text[], category text, category_canonical text, publisher_name text, title_i18n jsonb, content_language text, media_type text, audio_url text, duration_seconds integer, hotness numeric, personal_score numeric, matches_interest boolean, is_read boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with v as (select auth.uid() as uid),
followed as (
  select distinct lower(s) as slug from (
    select ut.slug as s from tag_follows tf join unified_tags ut on ut.id = tf.tag_id, v where tf.user_id = v.uid
    union all
    select ut.name as s from tag_follows tf join unified_tags ut on ut.id = tf.tag_id, v where tf.user_id = v.uid
    union all
    select jsonb_array_elements_text(p.interests) as s from profiles p, v
      where p.user_id = v.uid and jsonb_typeof(p.interests) = 'array'
  ) x where s is not null and btrim(s) <> ''
),
followed_arr as (select array_agg(slug) as slugs from followed),
reads as (select unr.article_id from user_news_reads unr, v where unr.user_id = v.uid),
base as (
  select na.id, na.slug, na.title, na.excerpt, na.url, na.image_url, na.author,
    na.published_at, na.source_id, na.views_count, na.is_featured, na.is_premium,
    na.country_ids, na.city_ids, na.tags, na.category, na.category_canonical,
    na.publisher_name, na.title_i18n, na.content_language,
    na.media_type, na.audio_url, na.duration_seconds, na.trust_score, na.quality_score,
    extract(epoch from (now() - na.published_at))/3600.0 as age_hours
  from news_articles na
  where na.published_at is not null
    and na.content is not null and na.content <> ''
    and na.duplicate_of_id is null
    and coalesce(na.is_premium,false) = false
    and (na.quality_status = 'passed'
         or (na.quality_status is null and (na.quality_score is null or na.quality_score >= 50)))
    and na.published_at > now() - make_interval(days => greatest(1, p_window_days))
),
scored as (
  select b.*,
    (coalesce(b.trust_score, b.quality_score, 50)/100.0)
      * power(0.5, b.age_hours / 24.0)
      * (case when b.is_featured and b.age_hours < 48 then 1.25 else 1.0 end)
      * (1 + least(0.3::numeric, ln(1 + coalesce(b.views_count,0)) / 30.0)) as hotness,
    coalesce(b.tags && (select slugs from followed_arr), false) as tag_match,
    ((p_country_ids is not null and b.country_ids && p_country_ids)
      or (p_city_ids is not null and b.city_ids && p_city_ids)) as geo_match,
    (b.id in (select article_id from reads)) as is_read
  from base b
)
select id, slug, title, excerpt, url, image_url, author, published_at, source_id,
  views_count::int, is_featured, is_premium, country_ids, city_ids, tags, category,
  category_canonical, publisher_name, title_i18n, content_language,
  media_type, audio_url, duration_seconds,
  round(hotness::numeric, 5) as hotness,
  round((hotness
    * (case when tag_match then 1.4 else 1.0 end)
    * (case when geo_match then 1.25 else 1.0 end)
    * (case when is_read then 0.4 else 1.0 end))::numeric, 5) as personal_score,
  (tag_match or geo_match) as matches_interest,
  is_read
from scored
where (not p_personalized_only) or tag_match or geo_match
order by (case when p_personalized_only then
    (hotness * (case when tag_match then 1.4 else 1.0 end) * (case when geo_match then 1.25 else 1.0 end) * (case when is_read then 0.4 else 1.0 end))
  else hotness end) desc nulls last
limit greatest(1, p_limit);
$function$;
GRANT ALL ON FUNCTION public.get_news_front(integer, uuid[], uuid[], integer, boolean) TO anon, authenticated, service_role;
