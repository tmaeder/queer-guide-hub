-- News quality holes (2026-07-14):
-- 1. news_commit_staging_batch committed staging rows regardless of review_status
--    and regardless of the LLM quality verdict — LLM-rejected items went live
--    (768 articles since March), and 2.7k pending_review rows were committed
--    before a human ever saw them. Cursor now skips review_status
--    pending_review/rejected and LLM verdicts rejected/review (those flow
--    through pipeline-review-gate -> commit_news_staging_item on human approval).
-- 2. The live news_commit_staging_batch had drifted BEHIND the repo: the
--    20260623063103 podcast fields (content_language, media_type, audio_url,
--    duration_seconds) were missing — no podcast row committed since 2026-06-23.
--    This re-applies the repo-latest body with the new gate.
-- 3. search_documents_index_news indexed every non-duplicate article, so
--    12.3k rejected + 1.5k review articles were publicly searchable while the
--    news UI hid them. The indexer now applies the same visibility predicate
--    as the public news queries (passed OR null-with-score>=50).

-- ── 1. Search indexer: only publicly-visible news ───────────────────────────
CREATE OR REPLACE FUNCTION public.search_documents_index_news(p_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'news:'||n.id, 'news', n.id, n.title, n.excerpt,
       setweight(to_tsvector('simple', unaccent(coalesce(n.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(coalesce(n.category_canonical,n.category),''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(n.excerpt,''))),'D')
    || public.i18n_to_tsv(n.title_i18n,'A'),
    jsonb_strip_nulls(jsonb_build_object(
      'category', coalesce(n.category_canonical, n.category),
      'is_featured', n.is_featured,
      'tags', to_jsonb(n.tags))),
    null::geography,
    null::smallint, 'live', coalesce(n.is_featured,false), n.quality_score, null::timestamptz,
    n.published_at, null::timestamptz, null::boolean, null::numeric, null::numeric,
    n.slug, n.image_url, null::text, null::text, null::text, now()
  from public.news_articles n
  left join public.content_embeddings ce on ce.content_type='news' and ce.content_id=n.id
  where n.duplicate_of_id is null
    -- Same visibility predicate as the public news queries (useNews /
    -- get_news_front): rejected/review articles must not be searchable.
    and (n.quality_status = 'passed'
         or (n.quality_status is null and (n.quality_score is null or n.quality_score >= 50)))
    and (p_id is null or n.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    quality_score=excluded.quality_score, start_date=excluded.start_date,
    slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$function$;

-- ── 2. Batch commit RPC: respect review_status + LLM verdict ────────────────
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
       -- Review gate (2026-07-14): never commit rows a human hasn't cleared.
       -- pending_review waits for commit_news_staging_item (admin approval);
       -- rejected is terminal. 'auto'/'approved' may proceed.
       AND coalesce(review_status,'auto') NOT IN ('pending_review','rejected')
       -- LLM verdict gate: quality_status='rejected' (off-topic/low quality)
       -- must never go live; 'review' waits for the human queue.
       AND coalesce(enriched_data->>'quality_status','') NOT IN ('rejected','review')
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
          -- Real outlet only: prefer an explicit publisher_name from the payload, else leave NULL
          -- so trg_set_publisher_name derives it. NEVER fall back to source_name ('rss-news').
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

-- ── 3. Data remediation (executed live 2026-07-14; recorded here for history) ─
-- The following one-time cleanups were applied via MCP against production and
-- are documented (not re-run — they are inherently idempotent but heavy):
--   * 654 articles whose LATEST staging LLM verdict was 'rejected' but which were
--     committed live before the review-gate wiring were taken down:
--       quality_status='rejected', seo_indexable=false, and an audit trail in
--       quality_decision->'takedown' (actor 'backfill-20260714', staging_id, reason).
--   * 13,164 stale news rows (rejected/review/duplicate) were purged from
--     search_documents; the fixed indexer keeps them out going forward.
--   * All remaining rejected/review news rows were de-indexed (seo_indexable=false)
--     so the news sitemap (which gates only on seo_indexable) stops emitting soft-404s.
-- The 626 'review'-verdict articles that are live were left in place: they are
-- high-relevance LGBTQ+ content flagged for sensitivity review, not irrelevance.
