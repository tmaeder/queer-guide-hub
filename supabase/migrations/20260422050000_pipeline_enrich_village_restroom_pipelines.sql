-- =============================================================================
-- Pipeline: enrich nodes for city/country/news/tags + new queer-villages +
--           restrooms pipelines + commit_village_staging_batch RPC
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. news-ingestion: add quality-score node between dedup and review
-- ---------------------------------------------------------------------------
UPDATE pipeline_definitions
SET
  nodes = '[
    {"id":"source","type":"source-rss-news","position":{"x":50,"y":200},"data":{"label":"Fetch RSS/News","config":{"sinceHours":24,"entity_type":"news_articles","maxArticles":100,"use_eligibility_rpc":true},"nodeTypeSlug":"source-rss-news"}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":280,"y":200},"data":{"label":"Normalize","config":{"entity_type":"news_articles"},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"enrich","type":"pipeline-enrich-news","position":{"x":510,"y":200},"data":{"label":"AI Enrich","config":{"max_per_run":25},"nodeTypeSlug":"pipeline-enrich-news"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":740,"y":200},"data":{"label":"Validate","config":{"entityType":"news_article","min_content_length":120,"reject_below_score":60},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedup","type":"pipeline-deduplicate","position":{"x":970,"y":200},"data":{"label":"Deduplicate","config":{"strategy":"fingerprint","review_min":0.75,"entity_type":"news_articles","auto_merge_min":0.9},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1200,"y":200},"data":{"label":"Quality Score","config":{"entity_type":"news_article","min_pass":60},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1430,"y":200},"data":{"label":"Review Gate","config":{"auto_approve_above":0.85},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1660,"y":200},"data":{"label":"Commit","config":{"use_rpc":"news_commit_staging_batch","entity_type":"news_articles"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"source","target":"normalize"},
    {"id":"e2","source":"normalize","target":"enrich"},
    {"id":"e3","source":"enrich","target":"validate"},
    {"id":"e4","source":"validate","target":"dedup"},
    {"id":"e5","source":"dedup","target":"quality"},
    {"id":"e6","source":"quality","target":"review"},
    {"id":"e7","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'news-ingestion';

-- ---------------------------------------------------------------------------
-- 2. city-ingestion: add enrich (Wikipedia) + quality nodes
-- ---------------------------------------------------------------------------
UPDATE pipeline_definitions
SET
  nodes = '[
    {"id":"src-csv","type":"source-csv-upload","position":{"x":60,"y":50},"data":{"label":"CSV Upload","config":{"batch_size":500,"target_table":"cities"}}},
    {"id":"src-geonames","type":"source-geonames","position":{"x":60,"y":190},"data":{"label":"GeoNames","config":{"limit":1000,"dataset":"cities15000","batch_size":500,"target_table":"cities","min_population":50000}}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":300,"y":190},"data":{"label":"Normalize","config":{"batch_size":500,"entityType":"city"},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":540,"y":190},"data":{"label":"Validate","config":{"entityType":"city"},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedupe","type":"pipeline-deduplicate","position":{"x":780,"y":190},"data":{"label":"Deduplicate","config":{"batch_size":500,"review_min":0.8,"auto_merge_min":0.92},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"enrich","type":"pipeline-enrich-city","position":{"x":1020,"y":190},"data":{"label":"Enrich (Wikipedia)","config":{"batch_size":30},"nodeTypeSlug":"pipeline-enrich-city"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1260,"y":190},"data":{"label":"Quality Score","config":{"entity_type":"city","min_pass":55},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1500,"y":190},"data":{"label":"Review Gate","config":{"auto_approve_above":0.9},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1740,"y":190},"data":{"label":"Commit","config":{"strategy":"upsert","targetTable":"cities"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-csv","target":"normalize"},
    {"id":"e2","source":"src-geonames","target":"normalize"},
    {"id":"e3","source":"normalize","target":"validate"},
    {"id":"e4","source":"validate","target":"dedupe"},
    {"id":"e5","source":"dedupe","target":"enrich"},
    {"id":"e6","source":"enrich","target":"quality"},
    {"id":"e7","source":"quality","target":"review"},
    {"id":"e8","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'city-ingestion';

-- ---------------------------------------------------------------------------
-- 3. country-ingestion: add enrich (ILGA + Wikipedia) + quality nodes
-- ---------------------------------------------------------------------------
UPDATE pipeline_definitions
SET
  nodes = '[
    {"id":"src-rc","type":"source-rest-countries","position":{"x":40,"y":40},"data":{"label":"REST Countries","config":{"batch_size":250,"entity_type":"country"}}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":320,"y":40},"data":{"label":"Normalize","config":{"batch_size":250,"entityType":"country"},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":580,"y":40},"data":{"label":"Validate","config":{"entityType":"country"},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedupe","type":"pipeline-deduplicate","position":{"x":840,"y":40},"data":{"label":"Deduplicate","config":{"batch_size":250,"review_min":0.85,"auto_merge_min":0.95},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"enrich","type":"pipeline-enrich-country","position":{"x":1100,"y":40},"data":{"label":"Enrich (ILGA + Wikipedia)","config":{"batch_size":30},"nodeTypeSlug":"pipeline-enrich-country"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1360,"y":40},"data":{"label":"Quality Score","config":{"entity_type":"country","min_pass":55},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1620,"y":40},"data":{"label":"Review Gate","config":{"auto_approve_above":0.9},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1880,"y":40},"data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"code","targetTable":"countries"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-rc","target":"normalize"},
    {"id":"e2","source":"normalize","target":"validate"},
    {"id":"e3","source":"validate","target":"dedupe"},
    {"id":"e4","source":"dedupe","target":"enrich"},
    {"id":"e5","source":"enrich","target":"quality"},
    {"id":"e6","source":"quality","target":"review"},
    {"id":"e7","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'country-ingestion';

-- ---------------------------------------------------------------------------
-- 4. tags-ingestion: add quality-score node between dedupe and review
-- ---------------------------------------------------------------------------
UPDATE pipeline_definitions
SET
  nodes = '[
    {"id":"src-extract","type":"source-tags-extract","position":{"x":40,"y":40},"data":{"label":"Extract Tags","config":{"batch_size":500,"entity_type":"tag"}}},
    {"id":"src-csv","type":"source-csv-upload","position":{"x":40,"y":160},"data":{"label":"CSV Upload","config":{"batch_size":500,"entity_type":"tag"}}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":320,"y":100},"data":{"label":"Normalize","config":{"batch_size":500,"entityType":"tag"},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":580,"y":100},"data":{"label":"Validate","config":{"entityType":"tag"},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedupe","type":"pipeline-deduplicate","position":{"x":840,"y":100},"data":{"label":"Deduplicate","config":{"batch_size":500,"review_min":0.85,"auto_merge_min":0.95},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1100,"y":100},"data":{"label":"Quality Score","config":{"entity_type":"tag","min_pass":50},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1360,"y":100},"data":{"label":"Review Gate","config":{"auto_approve_above":0.9},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1620,"y":100},"data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"slug","targetTable":"unified_tags"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-extract","target":"normalize"},
    {"id":"e2","source":"src-csv","target":"normalize"},
    {"id":"e3","source":"normalize","target":"validate"},
    {"id":"e4","source":"validate","target":"dedupe"},
    {"id":"e5","source":"dedupe","target":"quality"},
    {"id":"e6","source":"quality","target":"review"},
    {"id":"e7","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'tags-ingestion';

-- ---------------------------------------------------------------------------
-- 5. New: queer-villages-ingestion pipeline
-- ---------------------------------------------------------------------------
INSERT INTO pipeline_definitions (
  name, display_name, description,
  nodes, edges, default_context,
  max_concurrency, timeout_seconds, schedule,
  is_template, is_enabled, version
) VALUES (
  'queer-villages-ingestion',
  'Queer Villages Ingestion',
  'Imports and enriches LGBTQ+ villages/neighborhoods from Wikidata and existing DB rows. Weekly.',
  '[
    {"id":"src","type":"source-queer-villages","position":{"x":40,"y":100},"data":{"label":"Queer Villages","config":{"batch_size":100},"nodeTypeSlug":"source-queer-villages"}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":300,"y":100},"data":{"label":"Normalize","config":{"entityType":"queer_village","batch_size":100},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":560,"y":100},"data":{"label":"Validate","config":{"entityType":"queer_village"},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedupe","type":"pipeline-deduplicate","position":{"x":820,"y":100},"data":{"label":"Deduplicate","config":{"batch_size":100,"review_min":0.85,"auto_merge_min":0.95},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"enrich","type":"pipeline-enrich-village","position":{"x":1080,"y":100},"data":{"label":"Enrich (Wikipedia + Wikidata)","config":{"batch_size":20},"nodeTypeSlug":"pipeline-enrich-village"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1340,"y":100},"data":{"label":"Quality Score","config":{"entity_type":"queer_village","min_pass":50},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1600,"y":100},"data":{"label":"Review Gate","config":{"auto_approve_above":0.8},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1860,"y":100},"data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"slug","targetTable":"queer_villages"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  '[
    {"id":"e1","source":"src","target":"normalize"},
    {"id":"e2","source":"normalize","target":"validate"},
    {"id":"e3","source":"validate","target":"dedupe"},
    {"id":"e4","source":"dedupe","target":"enrich"},
    {"id":"e5","source":"enrich","target":"quality"},
    {"id":"e6","source":"quality","target":"review"},
    {"id":"e7","source":"review","target":"commit"}
  ]'::jsonb,
  '{"entity_type":"queer_village","target_table":"queer_villages"}'::jsonb,
  1, 900, '0 2 * * 0',
  false, true, 1
) ON CONFLICT (name) DO UPDATE SET
  nodes        = EXCLUDED.nodes,
  edges        = EXCLUDED.edges,
  is_enabled   = true,
  updated_at   = now();

-- ---------------------------------------------------------------------------
-- 6. New: restrooms-ingestion pipeline (Refuge Restrooms → venues table)
-- ---------------------------------------------------------------------------
INSERT INTO pipeline_definitions (
  name, display_name, description,
  nodes, edges, default_context,
  max_concurrency, timeout_seconds, schedule,
  is_template, is_enabled, version
) VALUES (
  'restrooms-ingestion',
  'Safe Restrooms Ingestion',
  'Imports LGBTQ+-safe restrooms from Refuge Restrooms API into venues (tagged safe-restroom). Weekly.',
  '[
    {"id":"src","type":"source-refuge-restrooms","position":{"x":40,"y":100},"data":{"label":"Refuge Restrooms","config":{"batch_size":500,"maxPages":10},"nodeTypeSlug":"source-refuge-restrooms"}},
    {"id":"normalize","type":"pipeline-normalize","position":{"x":300,"y":100},"data":{"label":"Normalize","config":{"entityType":"venue","batch_size":500},"nodeTypeSlug":"pipeline-normalize"}},
    {"id":"validate","type":"pipeline-validate","position":{"x":560,"y":100},"data":{"label":"Validate","config":{"entityType":"venue"},"nodeTypeSlug":"pipeline-validate"}},
    {"id":"dedupe","type":"pipeline-deduplicate","position":{"x":820,"y":100},"data":{"label":"Deduplicate","config":{"batch_size":500,"review_min":0.8,"auto_merge_min":0.92},"nodeTypeSlug":"pipeline-deduplicate"}},
    {"id":"quality","type":"pipeline-quality-score","position":{"x":1080,"y":100},"data":{"label":"Quality Score","config":{"entity_type":"venue","min_pass":40},"nodeTypeSlug":"pipeline-quality-score"}},
    {"id":"review","type":"pipeline-review-gate","position":{"x":1340,"y":100},"data":{"label":"Review Gate","config":{"auto_approve_above":0.7},"nodeTypeSlug":"pipeline-review-gate"}},
    {"id":"commit","type":"pipeline-commit","position":{"x":1600,"y":100},"data":{"label":"Commit to Venues","config":{"targetTable":"venues"},"nodeTypeSlug":"pipeline-commit"}}
  ]'::jsonb,
  '[
    {"id":"e1","source":"src","target":"normalize"},
    {"id":"e2","source":"normalize","target":"validate"},
    {"id":"e3","source":"validate","target":"dedupe"},
    {"id":"e4","source":"dedupe","target":"quality"},
    {"id":"e5","source":"quality","target":"review"},
    {"id":"e6","source":"review","target":"commit"}
  ]'::jsonb,
  '{"entity_type":"venue","target_table":"venues","source":"refuge-restrooms"}'::jsonb,
  1, 900, '0 6 * * 1',
  false, true, 1
) ON CONFLICT (name) DO UPDATE SET
  nodes        = EXCLUDED.nodes,
  edges        = EXCLUDED.edges,
  is_enabled   = true,
  updated_at   = now();

-- ---------------------------------------------------------------------------
-- 7. Schedule crons for new pipelines
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN ('wf-queer-villages-ingestion','wf-restrooms-ingestion');

SELECT cron.schedule(
  'wf-queer-villages-ingestion',
  '0 2 * * 0',  -- Sunday 02:00 UTC
  $$SELECT net.http_post(
    url     := (SELECT value FROM app_settings WHERE key='supabase_functions_url') || '/pipeline-executor',
    headers := jsonb_build_object('Authorization','Bearer ' || (SELECT value FROM app_settings WHERE key='service_role_key'),'Content-Type','application/json'),
    body    := jsonb_build_object('pipeline_name','queer-villages-ingestion')
  )$$
);

SELECT cron.schedule(
  'wf-restrooms-ingestion',
  '0 6 * * 1',  -- Monday 06:00 UTC
  $$SELECT net.http_post(
    url     := (SELECT value FROM app_settings WHERE key='supabase_functions_url') || '/pipeline-executor',
    headers := jsonb_build_object('Authorization','Bearer ' || (SELECT value FROM app_settings WHERE key='service_role_key'),'Content-Type','application/json'),
    body    := jsonb_build_object('pipeline_name','restrooms-ingestion')
  )$$
);

-- ---------------------------------------------------------------------------
-- 8. commit_village_staging_batch RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION commit_village_staging_batch(p_limit int DEFAULT 50)
RETURNS TABLE(staging_id uuid, village_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r   RECORD;
  v_id uuid;
  v_action text;
  v_slug text;
  v_name text;
  v_desc text;
  v_lat  double precision;
  v_lon  double precision;
  v_tags text[];
  v_website text;
  v_image_url text;
  v_db_id uuid;
  v_meta jsonb;
BEGIN
  FOR r IN
    SELECT s.id, s.normalized_data, s.enriched_data, s.source_entity_id
    FROM ingestion_staging s
    WHERE s.target_table = 'queer_villages'
      AND s.disposition   = 'pending'
      AND s.dedup_status  IN ('unique','pending')
    ORDER BY s.created_at
    LIMIT p_limit
  LOOP
    v_action := 'skipped';

    BEGIN
      v_name    := r.normalized_data->>'name';
      v_desc    := COALESCE(r.normalized_data->>'description', r.enriched_data->>'wikipedia_extract', '');
      v_lat     := (r.normalized_data->'location'->>'lat')::double precision;
      v_lon     := (r.normalized_data->'location'->>'lng')::double precision;
      v_tags    := ARRAY(SELECT jsonb_array_elements_text(COALESCE(r.normalized_data->'tags','[]'::jsonb)));
      v_website := r.normalized_data->>'website';
      v_image_url := COALESCE(r.enriched_data->>'image_url', r.normalized_data->>'image_url');
      v_meta    := COALESCE(r.normalized_data->'metadata', '{}'::jsonb);
      v_db_id   := (v_meta->>'db_id')::uuid;

      IF v_name IS NULL OR v_name = '' THEN
        UPDATE ingestion_staging SET disposition='rejected', error_message='missing name', updated_at=now() WHERE id=r.id;
        CONTINUE;
      END IF;

      -- Generate slug from name
      v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
      v_slug := trim(both '-' from v_slug);

      IF v_db_id IS NOT NULL THEN
        -- Update existing village
        UPDATE queer_villages SET
          description = CASE WHEN (description IS NULL OR description='') AND v_desc <> '' THEN v_desc ELSE description END,
          latitude    = COALESCE(latitude, v_lat),
          longitude   = COALESCE(longitude, v_lon),
          image_url   = COALESCE(image_url, v_image_url),
          tags        = CASE WHEN tags IS NULL OR array_length(tags,1) IS NULL THEN v_tags ELSE tags END,
          updated_at  = now()
        WHERE id = v_db_id
        RETURNING id INTO v_id;
        v_action := 'updated';
      ELSE
        -- Insert new village
        INSERT INTO queer_villages (name, slug, description, latitude, longitude, tags, website, image_url, created_at, updated_at)
        VALUES (v_name, v_slug, v_desc, v_lat, v_lon, v_tags, v_website, v_image_url, now(), now())
        ON CONFLICT (slug) DO UPDATE SET
          description = CASE WHEN (queer_villages.description IS NULL OR queer_villages.description='') AND v_desc<>'' THEN v_desc ELSE queer_villages.description END,
          updated_at  = now()
        RETURNING id INTO v_id;
        v_action := 'inserted';
      END IF;

      UPDATE ingestion_staging SET
        disposition      = 'committed',
        target_record_id = v_id,
        processed_at     = now(),
        updated_at       = now()
      WHERE id = r.id;

    EXCEPTION WHEN OTHERS THEN
      v_action := 'error';
      UPDATE ingestion_staging SET
        disposition   = 'rejected',
        error_message = SQLERRM,
        updated_at    = now()
      WHERE id = r.id;
    END;

    staging_id := r.id;
    village_id := v_id;
    action     := v_action;
    RETURN NEXT;
  END LOOP;
END;
$$;
