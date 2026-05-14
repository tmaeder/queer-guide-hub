-- Per-item commit RPC for news_articles, mirroring commit_event_staging_item shape.
-- Body logic derived from news_commit_staging_batch loop body.
-- Used by ingestion-review-api when reviewer approves an individual news
-- staging row, to avoid waiting for the next batch cron (~hourly).
-- Phase 2 follow-up.
-- Already applied to prod via Supabase MCP on 2026-05-01.
-- Smoke-tested: returns action='noop' for already-committed staging rows.

CREATE OR REPLACE FUNCTION public.commit_news_staging_item(
  p_staging_id uuid,
  p_actor text DEFAULT 'review:individual'
)
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
      published_at, category, tags, country_ids, city_ids,
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
      v_country_ids, v_city_ids, v_fp,
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

GRANT EXECUTE ON FUNCTION public.commit_news_staging_item(uuid, text) TO authenticated;
