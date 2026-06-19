-- Never show "rss-news" — always name the real news site.
--
-- 32% of news_articles displayed publisher_name = 'rss-news' (the source-rss-news adapter name
-- leaking through the commit RPC fallback), and ~2,150 more displayed aggregator/platform names
-- (NewsData.io / GNews.io / Google News). The real outlet is always recoverable:
--   * direct RSS feeds  -> news_sources.name
--   * aggregator sources -> the article URL host (e.g. theguardian.com -> "The Guardian")
--
-- This migration:
--   1. extracts the host->name map into a reusable IMMUTABLE fn
--   2. rewrites set_publisher_name() to be self-healing (repairs generic + aggregator labels)
--   3. fixes news_commit_staging_batch so it never writes 'rss-news' (leaves NULL -> trigger fills)
--   4. backfills existing rows (search trigger disabled: publisher_name is not indexed)

-- 1. Reusable host -> publisher-name derivation -------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_publisher_from_url(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  domain TEXT;
BEGIN
  IF p_url IS NULL OR btrim(p_url) = '' THEN
    RETURN NULL;
  END IF;

  domain := REGEXP_REPLACE(p_url, '^https?://(www\.)?', '');
  domain := REGEXP_REPLACE(domain, '/.*$', '');
  IF domain IS NULL OR btrim(domain) = '' THEN
    RETURN NULL;
  END IF;

  -- Aggregator / redirect hosts cannot identify a real outlet -> let caller fall back to source name
  IF domain ILIKE '%news.google.com' OR domain ILIKE '%google.com'
     OR domain ILIKE '%newsdata.io' OR domain ILIKE '%gnews.io'
     OR domain ILIKE '%newsapi.org' OR domain ILIKE '%thenewsapi.com'
     OR domain ILIKE '%headtopics.com' OR domain ILIKE '%msn.com'
     OR domain ILIKE '%flipboard.com' OR domain ILIKE '%bing.com' THEN
    RETURN NULL;
  END IF;

  RETURN CASE
    WHEN domain ILIKE '%nytimes.com' THEN 'New York Times'
    WHEN domain ILIKE '%washingtonpost.com' THEN 'Washington Post'
    WHEN domain ILIKE '%theguardian.com' THEN 'The Guardian'
    WHEN domain ILIKE '%bbc.com' OR domain ILIKE '%bbc.co.uk' THEN 'BBC'
    WHEN domain ILIKE '%cnn.com' THEN 'CNN'
    WHEN domain ILIKE '%nbcnews.com' THEN 'NBC News'
    WHEN domain ILIKE '%nbcbayarea.com' THEN 'NBC Bay Area'
    WHEN domain ILIKE '%abcnews.go.com' THEN 'ABC News'
    WHEN domain ILIKE '%abc.net.au' THEN 'ABC News (Australia)'
    WHEN domain ILIKE '%cbsnews.com' THEN 'CBS News'
    WHEN domain ILIKE '%cbc.ca' THEN 'CBC'
    WHEN domain ILIKE '%reuters.com' THEN 'Reuters'
    WHEN domain ILIKE '%apnews.com' THEN 'AP News'
    WHEN domain ILIKE '%huffpost.com' THEN 'HuffPost'
    WHEN domain ILIKE '%advocate.com' THEN 'The Advocate'
    WHEN domain ILIKE '%pinknews.co.uk' OR domain ILIKE '%thepinknews.com' THEN 'Pink News'
    WHEN domain ILIKE '%lgbtqnation.com' THEN 'LGBTQ Nation'
    WHEN domain ILIKE '%queerty.com' THEN 'Queerty'
    WHEN domain ILIKE '%outsports.com' THEN 'Outsports'
    WHEN domain ILIKE '%out.com' THEN 'Out Magazine'
    WHEN domain ILIKE '%them.us' THEN 'Them'
    WHEN domain ILIKE '%washingtonblade.com' THEN 'Washington Blade'
    WHEN domain ILIKE '%ebar.com' THEN 'Bay Area Reporter'
    WHEN domain ILIKE '%gaycitynews.com' THEN 'Gay City News'
    WHEN domain ILIKE '%dallasvoice.com' THEN 'Dallas Voice'
    WHEN domain ILIKE '%latimes.com' THEN 'LA Times'
    WHEN domain ILIKE '%npr.org' THEN 'NPR'
    WHEN domain ILIKE '%politico.com' THEN 'Politico'
    WHEN domain ILIKE '%axios.com' THEN 'Axios'
    WHEN domain ILIKE '%forbes.com' THEN 'Forbes'
    WHEN domain ILIKE '%newsweek.com' THEN 'Newsweek'
    WHEN domain ILIKE '%yahoo.com' THEN 'Yahoo News'
    WHEN domain ILIKE '%reddit.com' THEN 'Reddit'
    WHEN domain ILIKE '%newsbreak.com' THEN 'NewsBreak'
    WHEN domain ILIKE '%19thnews.org' THEN 'The 19th'
    WHEN domain ILIKE '%metroweekly.com' THEN 'Metro Weekly'
    WHEN domain ILIKE '%foxnews.com' THEN 'Fox News'
    WHEN domain ILIKE '%dailycaller.com' THEN 'Daily Caller'
    WHEN domain ILIKE '%dailykos.com' THEN 'Daily Kos'
    WHEN domain ILIKE '%pennlive.com' THEN 'PennLive'
    WHEN domain ILIKE '%salon.com' THEN 'Salon'
    WHEN domain ILIKE '%slate.com' THEN 'Slate'
    WHEN domain ILIKE '%vox.com' THEN 'Vox'
    WHEN domain ILIKE '%theatlantic.com' THEN 'The Atlantic'
    WHEN domain ILIKE '%rollingstone.com' THEN 'Rolling Stone'
    WHEN domain ILIKE '%variety.com' THEN 'Variety'
    WHEN domain ILIKE '%deadline.com' THEN 'Deadline'
    WHEN domain ILIKE '%indiewire.com' THEN 'IndieWire'
    WHEN domain ILIKE '%espn.com' THEN 'ESPN'
    WHEN domain ILIKE '%people.com' THEN 'People'
    WHEN domain ILIKE '%usatoday.com' THEN 'USA Today'
    WHEN domain ILIKE '%sfgate.com' THEN 'SFGate'
    WHEN domain ILIKE '%independent.co.uk' THEN 'The Independent'
    WHEN domain ILIKE '%aljazeera.com' THEN 'Al Jazeera'
    WHEN domain ILIKE '%pbs.org' THEN 'PBS'
    WHEN domain ILIKE '%bloomberg.com' THEN 'Bloomberg'
    WHEN domain ILIKE '%wired.com' THEN 'Wired'
    WHEN domain ILIKE '%thedailybeast.com' THEN 'The Daily Beast'
    WHEN domain ILIKE '%erininthemorning.com' THEN 'Erin in the Morning'
    WHEN domain ILIKE '%timesofindia.indiatimes.com' THEN 'Times of India'
    WHEN domain ILIKE '%irishtimes.com' THEN 'The Irish Times'
    WHEN domain ILIKE '%gcn.ie' THEN 'GCN'
    ELSE INITCAP(REPLACE(REPLACE(SPLIT_PART(domain, '.', 1), '-', ' '), '_', ' '))
  END;
END;
$function$;

-- 2. Self-healing publisher_name trigger -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_publisher_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_src_name TEXT;
  v_is_agg   BOOLEAN;
  v_generic  BOOLEAN;
  v_derived  TEXT;
BEGIN
  SELECT name, is_aggregator INTO v_src_name, v_is_agg
    FROM news_sources WHERE id = NEW.source_id;

  -- Aggregators by flag OR by known platform name (legacy rows predate the flag)
  v_is_agg := COALESCE(v_is_agg, FALSE)
    OR v_src_name IN ('NewsAPI.org','NewsData.io','GNews.io','TheNewsAPI.com',
                      'Google News LGBT Rights','News.google');

  v_generic := NEW.publisher_name IS NULL
    OR btrim(NEW.publisher_name) = ''
    OR lower(NEW.publisher_name) IN ('rss-news','rss_news','rss');

  -- Leave already-good names alone: only repair generic labels, or aggregator rows still
  -- carrying the aggregator's own name (e.g. publisher_name = 'NewsData.io').
  IF NOT v_generic AND NOT (v_is_agg AND NEW.publisher_name = v_src_name) THEN
    RETURN NEW;
  END IF;

  IF v_is_agg THEN
    v_derived := public.derive_publisher_from_url(NEW.url);
    NEW.publisher_name := COALESCE(v_derived, v_src_name, NEW.publisher_name);
  ELSE
    -- direct feed: the source IS the outlet
    NEW.publisher_name := COALESCE(v_src_name, NEW.publisher_name);
  END IF;

  -- never persist a generic label
  IF NEW.publisher_name IS NOT NULL
     AND lower(NEW.publisher_name) IN ('rss-news','rss_news','rss') THEN
    NEW.publisher_name := COALESCE(v_src_name, NULL);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Commit RPC: never fall back to ingestion_staging.source_name ('rss-news'). Leave NULL when
--    the normalized payload has no publisher_name; the BEFORE trigger derives the real outlet.
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
          published_at, category, tags, country_ids, city_ids,
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
          v_country_ids, v_city_ids, v_fp,
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

-- 4. One-time backfill. publisher_name is NOT indexed in search_documents, so disable the news
--    search-sync trigger to avoid thousands of wasted reindexes on the disk-constrained DB.
--    The BEFORE trigger trg_set_publisher_name stays enabled and recomputes the real outlet.
ALTER TABLE public.news_articles DISABLE TRIGGER trg_search_documents_news;

-- Recompute (a) any generic 'rss-news' label on any source, and (b) ALL aggregator-sourced rows so
-- junk host tokens ("News.google", "Us") fall back to the source name and the improved host->name
-- map is applied uniformly. Setting NULL lets trg_set_publisher_name derive the real outlet.
UPDATE public.news_articles na
   SET publisher_name = NULL, updated_at = now()
  FROM public.news_sources ns
 WHERE ns.id = na.source_id
   AND ( lower(coalesce(na.publisher_name,'')) IN ('rss-news','rss_news','rss','')
         OR na.publisher_name IS NULL
         OR coalesce(ns.is_aggregator, false)
         OR ns.name IN ('NewsAPI.org','NewsData.io','GNews.io','TheNewsAPI.com',
                        'Google News LGBT Rights','News.google') );

ALTER TABLE public.news_articles ENABLE TRIGGER trg_search_documents_news;
